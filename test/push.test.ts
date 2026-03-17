import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from 'vitest';
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

  it('validForSec in poll response is capped at 60 regardless of push TTL', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: { ...PUSH_BASE, ttlSec: 300 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    const body = response.json();
    // validForSec should be capped at 60, regardless of the 300s push TTL
    expect(body.validForSec).toBeGreaterThanOrEqual(58);
    expect(body.validForSec).toBeLessThanOrEqual(60);
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

  // -------------------------------------------------------------------------
  // Colored text segments
  // -------------------------------------------------------------------------

  it('segments are passed through to the device response', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'seg_text',
            type: 'text',
            segments: [
              { text: 'A', color: '#FF0000' },
              { text: 'B', color: '#0000FF' },
              { text: 'C', color: '#00FF00' },
            ],
          },
        ],
      },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const candidate = body.candidates.find(
      (c: { id: string }) => c.id === 'seg_text'
    );
    expect(candidate).toBeDefined();
    expect(Array.isArray(candidate.segments)).toBe(true);
    expect(candidate.segments).toHaveLength(3);
    expect(candidate.segments[0]).toEqual({ text: 'A', color: '#FF0000' });
    expect(candidate.segments[1]).toEqual({ text: 'B', color: '#0000FF' });
    expect(candidate.segments[2]).toEqual({ text: 'C', color: '#00FF00' });
  });

  it('plain text is auto-joined from segments when text field is omitted', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'seg_only',
            type: 'text',
            segments: [
              { text: 'Hello', color: '#FF0000' },
              { text: ' ', color: '#FFFFFF' },
              { text: 'LED', color: '#0000FF' },
            ],
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
      (c: { id: string }) => c.id === 'seg_only'
    );
    expect(candidate).toBeDefined();
    // Auto-joined text
    expect(candidate.text).toBe('Hello LED');
    // Width should be estimated from joined text
    expect(typeof candidate.estimatedWidthPx).toBe('number');
    expect(candidate.estimatedWidthPx).toBeGreaterThan(0);
  });

  it('explicit text field takes precedence over segment join for display text', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'both',
            type: 'text',
            text: 'EXPLICIT',
            segments: [
              { text: 'seg1', color: '#FF0000' },
              { text: 'seg2', color: '#0000FF' },
            ],
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
      (c: { id: string }) => c.id === 'both'
    );
    expect(candidate.text).toBe('EXPLICIT');
    // Segments still forwarded
    expect(candidate.segments).toHaveLength(2);
  });

  it('segments without color inherit from candidate color', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'inherit_color',
            type: 'text',
            text: 'Hi',
            color: '#FF8800',
            segments: [
              { text: 'H' },          // no per-segment color → inherits #FF8800
              { text: 'i', color: '#FFFFFF' },
            ],
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
      (c: { id: string }) => c.id === 'inherit_color'
    );
    expect(candidate.color).toBe('#FF8800'); // candidate-level color present
    expect(candidate.segments[0].color).toBeUndefined();  // no override → device inherits
    expect(candidate.segments[1].color).toBe('#FFFFFF');
  });

  it('returns 400 when neither text nor segments are provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'empty',
            type: 'text',
            // neither text nor segments
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe('Validation Error');
  });

  it('returns 400 for invalid hex color in a segment', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: {
        ...PUSH_BASE,
        candidates: [
          {
            id: 'bad_seg_color',
            type: 'text',
            segments: [
              { text: 'A', color: 'red' }, // invalid
            ],
          },
        ],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // TTL / cache-lifetime tests (use fake timers to simulate time passage)
  // -------------------------------------------------------------------------

  describe('TTL persistence (validForSec alias + time simulation)', () => {
    afterEach(() => {
      vi.useRealTimers();
      contentStore.clear();
    });

    it('accepts validForSec as alias for ttlSec in the push request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/content/push',
        payload: {
          // intentionally omit ttlSec so validForSec is the only TTL hint
          deviceId: 'ttl-alias-test',
          validForSec: 300,
          priority: 'normal',
          candidates: PUSH_BASE.candidates,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.stored).toBe(true);
      // expiresAt must be ~300 s in the future, not 60 s (the default)
      const expiresIn = new Date(body.expiresAt).getTime() - Date.now();
      expect(expiresIn).toBeGreaterThan(270_000); // at least 270 s
      expect(expiresIn).toBeLessThanOrEqual(300_000);
    });

    it('pushed content is still returned after 70 s within a 300 s TTL', async () => {
      // Only fake the Date object — leave real setTimeout so Fastify keeps working
      vi.useFakeTimers({ toFake: ['Date'] });
      const t0 = Date.now();
      vi.setSystemTime(t0);

      await app.inject({
        method: 'POST',
        url: '/v1/content/push',
        payload: {
          deviceId: 'ttl-70s-test',
          validForSec: 300,
          priority: 'normal',
          candidates: PUSH_BASE.candidates,
        },
      });

      // T+0: pushed content should be served
      let res = await app.inject({
        method: 'POST',
        url: '/v1/watchface/content',
        payload: { ...POLL_REQUEST, deviceId: 'ttl-70s-test' },
      });
      expect(res.statusCode).toBe(200);
      expect(
        res.json().candidates.some((c: { text?: string }) => c.text === 'Hello LED')
      ).toBe(true);

      // T+70 s: still within the 300 s TTL
      vi.setSystemTime(t0 + 70_000);
      res = await app.inject({
        method: 'POST',
        url: '/v1/watchface/content',
        payload: { ...POLL_REQUEST, deviceId: 'ttl-70s-test' },
      });
      expect(res.statusCode).toBe(200);
      expect(
        res.json().candidates.some((c: { text?: string }) => c.text === 'Hello LED')
      ).toBe(true);
    });

    it('pushed content expires after the full TTL and falls back to auto-generated content', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const t0 = Date.now();
      vi.setSystemTime(t0);

      await app.inject({
        method: 'POST',
        url: '/v1/content/push',
        payload: {
          deviceId: 'ttl-expire-test',
          validForSec: 300,
          priority: 'normal',
          candidates: PUSH_BASE.candidates,
        },
      });

      // T+301 s: TTL has expired
      vi.setSystemTime(t0 + 301_000);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/watchface/content',
        payload: {
          ...POLL_REQUEST,
          deviceId: 'ttl-expire-test',
          context: { bgValue: 124, trend: 'flat' },
        },
      });

      expect(res.statusCode).toBe(200);
      // No pushed content — should be auto-generated from context
      expect(
        res.json().candidates.every((c: { text?: string }) => c.text !== 'Hello LED')
      ).toBe(true);
      expect(
        res.json().candidates.some(
          (c: { type: string; text?: string }) =>
            c.type === 'text' && c.text?.includes('124')
        )
      ).toBe(true);
    });

    it('multiple polls within the TTL do not evict the push cache', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const t0 = Date.now();
      vi.setSystemTime(t0);

      await app.inject({
        method: 'POST',
        url: '/v1/content/push',
        payload: {
          deviceId: 'ttl-multi-read-test',
          validForSec: 300,
          priority: 'normal',
          candidates: PUSH_BASE.candidates,
        },
      });

      const pollPayload = { ...POLL_REQUEST, deviceId: 'ttl-multi-read-test' };

      for (const offsetSec of [0, 30, 60, 90, 120, 180]) {
        vi.setSystemTime(t0 + offsetSec * 1000);
        const res = await app.inject({
          method: 'POST',
          url: '/v1/watchface/content',
          payload: pollPayload,
        });
        expect(res.statusCode).toBe(200);
        expect(
          res.json().candidates.some((c: { text?: string }) => c.text === 'Hello LED'),
          `poll at T+${offsetSec}s should still serve cached content`
        ).toBe(true);
      }
    });

    it('ttlSec takes precedence when both ttlSec and validForSec are supplied', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/content/push',
        payload: {
          deviceId: 'ttl-precedence-test',
          ttlSec: 120,
          validForSec: 300, // should be ignored in favour of ttlSec
          priority: 'normal',
          candidates: PUSH_BASE.candidates,
        },
      });

      expect(response.statusCode).toBe(201);
      const expiresIn = new Date(response.json().expiresAt).getTime() - Date.now();
      // Should be ~120 s, not ~300 s
      expect(expiresIn).toBeGreaterThan(110_000);
      expect(expiresIn).toBeLessThanOrEqual(120_000);
    });
  });

  // -------------------------------------------------------------------------
  // align field
  // -------------------------------------------------------------------------

  it('push with align "right" → poll response has renderPlan.align === "right"', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: { ...PUSH_BASE, align: 'right' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().renderPlan.align).toBe('right');
  });

  it('push with align "center" → poll response has renderPlan.align === "center"', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: { ...PUSH_BASE, align: 'center' },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().renderPlan.align).toBe('center');
  });

  it('push without align → poll response has renderPlan.align === "left" (default)', async () => {
    await app.inject({
      method: 'POST',
      url: '/v1/content/push',
      payload: PUSH_BASE,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/watchface/content',
      payload: POLL_REQUEST,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().renderPlan.align).toBe('left');
  });
});
