import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  host: process.env.HOST ?? '0.0.0.0',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  apiKeyOptional: process.env.API_KEY_OPTIONAL,
  debugEnabled: process.env.DEBUG_ENABLED === 'true',
  serviceName: 'ulanzi-api',
  serviceVersion: '1.0.0',
  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? '60', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10),
  },
  charWidthPx: parseInt(process.env.CHAR_WIDTH_PX ?? '4', 10),
  charSpacingPx: parseInt(process.env.CHAR_SPACING_PX ?? '1', 10),
} as const;
