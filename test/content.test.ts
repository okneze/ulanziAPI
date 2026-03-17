import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import type { FastifyInstance } from 'fastify';

const BASE_REQUEST = {
  deviceId: 'clock-123',
  view: 'onedigit',
  display: {
    widthPx: 32,
    heightPx: 8,
    reservedLeftPx: 5,
    reservedBottomPx: 2,
  },
  locale: 'de-DE',
  time: '2026-03-15T10:30:00+01:00',
  context: {
    bgValue: 124,
    trend: 'flat',
  },
  clientCapabilities: {
    canScroll: true,
    canAnimate: true,
    supportsBitmap: true,
    maxFps: 10,
  },
};

describe('POST /v1/watchface/content', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with schema-compliant response for valid request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: BASE_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    // Top-level fields
    expect(body.schemaVersion).toBe(1);
    expect(typeof body.contentId).toBe('string');
    expect(body.contentId.length).toBeGreaterThan(0);
    expect(typeof body.validForSec).toBe('number');
    expect(['low', 'normal', 'high', 'critical']).toContain(body.priority);

    // renderPlan
    expect(body.renderPlan).toBeDefined();
    expect(typeof body.renderPlan.strategy).toBe('string');
    expect(typeof body.renderPlan.scroll.enabled).toBe('boolean');
    expect(['left', 'center', 'right']).toContain(body.renderPlan.align);

    // candidates
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(body.candidates.length).toBeGreaterThan(0);

    // fallback
    expect(body.fallback.type).toBe('text');
    expect(typeof body.fallback.text).toBe('string');
  });

  it('each candidate has required fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: BASE_REQUEST,
    });

    const body = response.json();
    for (const candidate of body.candidates) {
      expect(typeof candidate.id).toBe('string');
      expect(['text', 'bitmap']).toContain(candidate.type);
      if (candidate.type === 'text') {
        expect(typeof candidate.text).toBe('string');
        expect(typeof candidate.estimatedWidthPx).toBe('number');
      } else if (candidate.type === 'bitmap') {
        expect(typeof candidate.widthPx).toBe('number');
        expect(typeof candidate.heightPx).toBe('number');
        expect(Array.isArray(candidate.frames)).toBe(true);
      }
    }
  });

  it('onedigit view produces correct availableWidthPx', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content?debug=true',
      payload: {
        ...BASE_REQUEST,
        view: 'onedigit',
        display: { widthPx: 32, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.debug).toBeDefined();
    expect(body.debug.availableWidthPx).toBe(27); // 32 - 5
    expect(body.debug.availableHeightPx).toBe(6);  // 8 - 2
  });

  it('onedigit_dual view produces smaller availableWidthPx than onedigit', async () => {
    const [r1, r2] = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/watchface/content?debug=true',
        payload: {
          ...BASE_REQUEST,
          view: 'onedigit',
          display: { widthPx: 32, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
        },
      }),
      app.inject({
        method: 'POST',
        url: '/v1/watchface/content?debug=true',
        payload: {
          ...BASE_REQUEST,
          view: 'onedigit_dual',
          display: { widthPx: 32, heightPx: 8, reservedLeftPx: 10, reservedBottomPx: 2 },
        },
      }),
    ]);

    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);

    const b1 = r1.json();
    const b2 = r2.json();

    expect(b1.debug.availableWidthPx).toBeGreaterThan(b2.debug.availableWidthPx);
  });

  it('activates scroll recommendation when text is longer than available width', async () => {
    // Very narrow display to force scroll
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        ...BASE_REQUEST,
        display: { widthPx: 10, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
        context: { bgValue: 12345, trend: 'rising_fast' },
        clientCapabilities: { canScroll: true, canAnimate: true, supportsBitmap: false, maxFps: 10 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.renderPlan.scroll.enabled).toBe(true);
  });

  it('does not enable scroll when client cannot scroll', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        ...BASE_REQUEST,
        display: { widthPx: 10, heightPx: 8, reservedLeftPx: 5, reservedBottomPx: 2 },
        context: { bgValue: 12345, trend: 'rising_fast' },
        clientCapabilities: { canScroll: false, canAnimate: false, supportsBitmap: false, maxFps: 10 },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.renderPlan.scroll.enabled).toBe(false);
  });

  it('returns debug info when ?debug=true', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content?debug=true',
      payload: BASE_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.debug).toBeDefined();
    expect(typeof body.debug.availableWidthPx).toBe('number');
    expect(typeof body.debug.availableHeightPx).toBe('number');
    expect(Array.isArray(body.debug.notes)).toBe(true);
  });

  it('critical priority for very low bg value', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: { ...BASE_REQUEST, context: { bgValue: 45, trend: 'falling_fast' } },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.priority).toBe('critical');
  });

  it('contentId is unique per request', async () => {
    const [r1, r2] = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/watchface/content', payload: BASE_REQUEST }),
      app.inject({ method: 'POST', url: '/v1/watchface/content', payload: BASE_REQUEST }),
    ]);

    expect(r1.json().contentId).not.toBe(r2.json().contentId);
  });
});
