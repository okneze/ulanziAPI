import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { ContentRequestSchema } from '../schemas/request.js';
import { ContentResponseSchema } from '../schemas/response.js';
import { planContent } from '../services/contentPlanner.js';
import { RateLimiter } from '../utils/rateLimiter.js';
import { config } from '../config/index.js';

// Single shared in-memory rate limiter
const rateLimiter = new RateLimiter(
  config.rateLimit.max,
  config.rateLimit.timeWindow
);

export async function contentRoute(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/v1/watchface/content',
    {
      schema: {
        description: 'Get display content for a watchface view',
        tags: ['content'],
        querystring: {
          type: 'object',
          properties: {
            debug: { type: 'boolean' },
          },
        },
        body: {
          type: 'object',
          description: 'Content request payload',
        },
        response: {
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
    async (
      request: FastifyRequest<{ Querystring: { debug?: boolean } }>,
      reply: FastifyReply
    ) => {
      // Rate limiting by deviceId or IP
      let rateLimitKey: string;
      try {
        const rawBody = request.body as Record<string, unknown>;
        rateLimitKey =
          typeof rawBody?.deviceId === 'string' && rawBody.deviceId
            ? `device:${rawBody.deviceId}`
            : `ip:${request.ip}`;
      } catch {
        rateLimitKey = `ip:${request.ip}`;
      }

      if (!rateLimiter.check(rateLimitKey)) {
        return reply.status(429).send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please slow down.',
        });
      }

      // Validate request body with Zod
      const parseResult = ContentRequestSchema.safeParse(request.body);
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

      const includeDebug = request.query.debug === true;
      const responseData = planContent(parseResult.data, includeDebug);

      // Validate the response matches the schema (dev safeguard)
      if (config.nodeEnv !== 'production') {
        ContentResponseSchema.parse(responseData);
      }

      return reply.status(200).send(responseData);
    }
  );
}
