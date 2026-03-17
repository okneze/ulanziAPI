import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

describe('Input validation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 when deviceId is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        view: 'onedigit',
        display: { widthPx: 32, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation Error');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 400 for invalid view value', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-test',
        view: 'invalid_view',
        display: { widthPx: 32, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation Error');
  });

  it('returns 400 for missing display block', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-test',
        view: 'onedigit',
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation Error');
  });

  it('returns 400 when display.widthPx is zero', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-test',
        view: 'onedigit',
        display: { widthPx: 0, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 when display.widthPx is negative', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-test',
        view: 'onedigit',
        display: { widthPx: -10, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for invalid trend value', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-test',
        view: 'onedigit',
        display: { widthPx: 32, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
        context: { bgValue: 100, trend: 'invalid_trend' },
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('accepts request with optional fields omitted', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-minimal',
        view: 'onedigit',
        display: { widthPx: 32, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it('accepts onedigit_dual view', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        deviceId: 'clock-dual',
        view: 'onedigit_dual',
        display: { widthPx: 32, heightPx: 8, reservedLeftPx: 10, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(200);
  });
});
