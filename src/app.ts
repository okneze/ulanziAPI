import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from './config/index.js';
import { healthRoute } from './routes/health.js';
import { contentRoute } from './routes/content.js';

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            // Deliberately omit headers/body to avoid leaking sensitive data
          };
        },
      },
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Swagger / OpenAPI
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Ulanzi LED Display API',
        description:
          'External API that provides content for LED displays (Nightscout-Clock OneDigit Views)',
        version: config.serviceVersion,
      },
      servers: [
        {
          url: `http://localhost:${config.port}`,
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'system', description: 'System endpoints' },
        { name: 'content', description: 'Content endpoints' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Routes
  await fastify.register(healthRoute);
  await fastify.register(contentRoute);

  return fastify;
}
