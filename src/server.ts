import { buildApp } from './app.js';
import { config } from './config/index.js';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      `🚀 Server running on http://${config.host}:${config.port}`
    );
    app.log.info(
      `📚 Swagger UI available at http://${config.host}:${config.port}/docs`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
