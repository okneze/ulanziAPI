import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { PushContentRequestSchema } from '../schemas/push.js';
import { contentStore } from '../services/contentStore.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { config } from '../config/index.js';

// Separate rate limiter for push calls (keyed by IP of the calling service)
const rateLimiter = new RateLimiter(
  config.rateLimit.max,
  config.rateLimit.timeWindow
);

export async function pushRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/v1/content/push',
    {
      schema: {
        description:
          'Push content for a specific device from an external service. ' +
          'The content is cached and returned when the device next polls ' +
          'POST /v1/watchface/content.',
        tags: ['content'],
        body: {
          type: 'object',
          description: 'Content push payload',
        },
        response: {
          201: {
            type: 'object',
            properties: {
              stored: { type: 'boolean' },
              deviceId: { type: 'string' },
              expiresAt: { type: 'string' },
            },
          },
          400: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
              details: { type: 'array' },
            },
          },
          429: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // Rate-limit by caller IP
      const rateLimitKey = `push:ip:${request.ip}`;
      if (!rateLimiter.check(rateLimitKey)) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please slow down.',
        });
      }

      const parseResult = PushContentRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        const zodErr = parseResult.error as ZodError;
        return reply.status(400).send({
          statusCode: 400,
          error: 'Validation Error',
          message: 'Invalid request body',
          details: zodErr.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }

      const expiresAt = contentStore.set(parseResult.data);

      const { deviceId, ttlSec, priority, candidates } = parseResult.data;
      request.log.info(
        {
          event: 'content_push',
          deviceId,
          ttlSec,
          priority: priority ?? 'normal',
          candidateCount: candidates.length,
          candidates: candidates.map((c) =>
            c.type === 'text'
              ? { id: c.id, type: 'text', text: c.text ?? '[segments]', color: c.color }
              : { id: c.id, type: 'bitmap', widthPx: c.widthPx, heightPx: c.heightPx, frames: c.frames.length }
          ),
          expiresAt: expiresAt.toISOString(),
        },
        `push deviceId=${deviceId} candidates=${candidates.length} ttl=${ttlSec}s`
      );

      return reply.status(201).send({
        stored: true,
        deviceId: parseResult.data.deviceId,
        expiresAt: expiresAt.toISOString(),
      });
    }
  );
}
