import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/app.js';
import { contentStore } from '../src/services/contentStore.js';
import type { FastifyInstance } from 'fastify';

const PUSH_BASE = {
  deviceId: 'clock-push-test',
  ttlSec: 60,
  priority: 'normal',
  candidates: [
    {
      id: 'full_text',
      type: 'text',
      text: 'Hello LED',
      color: '#FF8800',
    },
    {
      id: 'short_text',
      type: 'text',
      text: 'Hi',
      color: '#FF8800',
      estimatedWidthPx: 9,
    },
  ],
  fallback: {
    type: 'text',
    text: '--',
  },
};

const POLL_REQUEST = {
  deviceId: 'clock-push-test',
  view: 'onedigit',
  display: {
    widthPx: 32,
    heightPx: 8,
    reservedLeftPx: 5,
    reservedBottomPx: 2,
  },
  clientCapabilities: {
    canScroll: true,
    canAnimate: false,
    supportsBitmap: false,
    maxFps: 5,
  },
};

describe('POST /v1/content/push', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    contentStore.clear();
  });

  it('returns 201 with stored=true for a valid push', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: PUSH_BASE,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.stored).toBe(true);
    expect(body.deviceId).toBe(PUSH_BASE.deviceId);
    expect(typeof body.expiresAt).toBe('string');
    // expiresAt should be in the future
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('device poll returns pushed content with color', async () => {
    // First push content
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: PUSH_BASE,
    });

    // Then device polls
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.schemaVersion).toBe(1);
    expect(body.priority).toBe('normal');

    // Candidates should come from the push, not auto-generated
    const textCandidates = body.candidates.filter(
      (c: { type: string }) => c.type === 'text'
    );
    expect(textCandidates.length).toBeGreaterThan(0);

    const full = textCandidates.find(
      (c: { id: string }) => c.id === 'full_text'
    );
    expect(full).toBeDefined();
    expect(full.text).toBe('Hello LED');
    expect(full.color).toBe('#FF8800');
    expect(typeof full.estimatedWidthPx).toBe('number');
  });

  it('auto-calculates estimatedWidthPx when omitted in push', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'my_text',
            type: 'text',
            text: 'TEST',
            // estimatedWidthPx intentionally omitted
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    const candidate = body.candidates.find(
      (c: { id: string }) => c.id === 'my_text'
    );
    expect(candidate).toBeDefined();
    expect(typeof candidate.estimatedWidthPx).toBe('number');
    expect(candidate.estimatedWidthPx).toBeGreaterThan(0);
  });

  it('uses estimatedWidthPx provided in push when present', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'precise',
            type: 'text',
            text: 'HI',
            estimatedWidthPx: 99,
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    const candidate = body.candidates.find(
      (c: { id: string }) => c.id === 'precise'
    );
    expect(candidate.estimatedWidthPx).toBe(99);
  });

  it('validForSec reflects remaining TTL from push', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: { ...PUSH_BASE, ttlSec: 120 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    // Should be close to 120 (allow a few seconds of test execution time)
    expect(body.validForSec).toBeGreaterThanOrEqual(118);
    expect(body.validForSec).toBeLessThanOrEqual(120);
  });

  it('device falls back to auto-generated content when no pushed content', async () => {
    // Store is already cleared in beforeEach — no push
    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: {
        ...POLL_REQUEST,
        context: { bgValue: 124, trend: 'flat' },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // Auto-generated content has bg+trend text like "124→"
    const hasAutoText = body.candidates.some(
      (c: { type: string; text?: string }) =>
        c.type === 'text' && c.text?.includes('124')
    );
    expect(hasAutoText).toBe(true);
  });

  it('push with bitmap candidate returns bitmap in poll response', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'my_icon',
            type: 'bitmap',
            widthPx: 8,
            heightPx: 6,
            frames: ['3C4242423C00'],
            color: '#00FF00',
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    const bitmap = body.candidates.find(
      (c: { type: string }) => c.type === 'bitmap'
    );
    expect(bitmap).toBeDefined();
    expect(bitmap.frames).toEqual(['3C4242423C00']);
    expect(bitmap.color).toBe('#00FF00');
  });

  it('push with critical priority is returned to device', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: { ...PUSH_BASE, priority: 'critical' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    expect(response.json().priority).toBe('critical');
  });

  it('returns 400 when deviceId is missing in push', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ttlSec: 60,
        candidates: [{ id: 'x', type: 'text', text: 'Hi' }],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation Error');
  });

  it('returns 400 when candidates array is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: { ...PUSH_BASE, candidates: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for invalid hex color', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'bad_color',
            type: 'text',
            text: 'Test',
            color: 'red', // not a valid #RRGGBB
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation Error');
  });

  it('accepts valid hex colors in various casings', async () => {
    for (const color of ['#FF0000', '#ff0000', '#aAbBcC']) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/content/push',
        payload: {
          ...PUSH_BASE,
          deviceId: `clock-color-test-${color}`,
          candidates: [
            { id: 'c', type: 'text', text: 'Hi', color },
          ],
        },
      });
      expect(response.statusCode).toBe(201);
    }
  });

  it('push overwrites previous content for the same device', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [{ id: 'first', type: 'text', text: 'First' }],
      },
    });

    // Push again — should overwrite
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [{ id: 'second', type: 'text', text: 'Second' }],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    expect(body.candidates.some((c: { text?: string }) => c.text === 'Second')).toBe(true);
    expect(body.candidates.some((c: { text?: string }) => c.text === 'First')).toBe(false);
  });

  it('debug block says "served from pushed content cache"', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: PUSH_BASE,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content?debug=true',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    expect(body.debug).toBeDefined();
    expect(body.debug.notes).toContain('served from pushed content cache');
  });
});
