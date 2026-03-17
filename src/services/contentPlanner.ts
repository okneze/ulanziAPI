import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';
import type { ContentRequest, Context, Trend } from '../schemas/request.js';
import type {
  BitmapCandidate,
  Candidate,
  ContentResponse,
  Priority,
  RenderPlan,
  TextCandidate,
} from '../schemas/response.js';
import type { StoredEntry } from './contentStore.js';
import { estimateTextWidth } from '../utils/widthEstimator.js';

// ---------------------------------------------------------------------------
// Trend arrow helpers
// ---------------------------------------------------------------------------
const TREND_ARROWS: Record<Trend, string> = {
  rising_fast: '↑↑',
  rising: '↑',
  flat: '→',
  falling: '↓',
  falling_fast: '↓↓',
  unknown: '?',
};

function trendArrow(trend: Trend | undefined): string {
  if (!trend) return '';
  return TREND_ARROWS[trend] ?? '';
}

// ---------------------------------------------------------------------------
// Priority heuristic based on bg value
// ---------------------------------------------------------------------------
function calcPriority(ctx: Context): Priority {
  if (!ctx?.bgValue) return 'normal';
  const bg = ctx.bgValue;
  if (bg < 60 || bg > 300) return 'critical';
  if (bg < 70 || bg > 250) return 'high';
  if (bg < 80 || bg > 180) return 'normal';
  return 'low';
}

// ---------------------------------------------------------------------------
// Build text candidates for bg + trend
// ---------------------------------------------------------------------------
function buildBgCandidates(
  ctx: NonNullable<Context>,
  availableWidthPx: number,
  supportsBitmap: boolean
): { candidates: Candidate[]; scrollNeeded: boolean } {
  const bg = ctx.bgValue;
  const arrow = trendArrow(ctx.trend);

  const fullText = bg !== undefined ? `${bg}${arrow}` : arrow;
  const shortText = bg !== undefined ? `${bg}` : '';

  const candidates: Candidate[] = [];
  let scrollNeeded = false;

  const fullWidth = estimateTextWidth(fullText);
  const shortWidth = estimateTextWidth(shortText);

  const full: TextCandidate = {
    id: 'full_text',
    type: 'text',
    text: fullText,
    estimatedWidthPx: fullWidth,
  };
  candidates.push(full);

  if (fullText !== shortText) {
    const short: TextCandidate = {
      id: 'short_text',
      type: 'text',
      text: shortText,
      estimatedWidthPx: shortWidth,
    };
    candidates.push(short);
  }

  if (supportsBitmap && ctx.trend) {
    // Simple smiley/arrow bitmap placeholder (8x6 pixels, 1-bit encoded)
    const bitmapCandidate: BitmapCandidate = {
      id: 'icon',
      type: 'bitmap',
      widthPx: 8,
      heightPx: 6,
      frames: ['3C4242423C00'],
    };
    candidates.push(bitmapCandidate);
  }

  // Check if the best candidate needs scrolling
  if (fullWidth > availableWidthPx) {
    scrollNeeded = true;
  }

  return { candidates, scrollNeeded };
}

// ---------------------------------------------------------------------------
// Build render plan
// ---------------------------------------------------------------------------
function buildRenderPlan(
  scrollNeeded: boolean,
  canScroll: boolean,
  availableWidthPx: number
): RenderPlan {
  const scrollEnabled = scrollNeeded && canScroll;

  // Speed heuristic: faster for wider content
  const speedPxPerSec = availableWidthPx < 20 ? 6 : 8;

  return {
    strategy: 'best_fit_then_scroll',
    scroll: {
      enabled: scrollEnabled,
      speedPxPerSec,
      pauseMs: 600,
      loop: 1,
    },
    align: 'left',
  };
}

// ---------------------------------------------------------------------------
// Main content planner
// ---------------------------------------------------------------------------
export function planContent(
  req: ContentRequest,
  includeDebug: boolean
): ContentResponse {
  const { display, context, clientCapabilities } = req;

  const availableWidthPx = display.widthPx - display.reservedLeftPx;
  const availableHeightPx = display.heightPx - display.reservedBottomPx;

  const canScroll = clientCapabilities?.canScroll ?? false;
  const supportsBitmap = clientCapabilities?.supportsBitmap ?? false;

  const priority = calcPriority(context);

  const { candidates, scrollNeeded } = context
    ? buildBgCandidates(context, availableWidthPx, supportsBitmap)
    : {
        candidates: [
          {
            id: 'full_text',
            type: 'text' as const,
            text: '',
            estimatedWidthPx: 0,
          } satisfies TextCandidate,
        ],
        scrollNeeded: false,
      };

  const renderPlan = buildRenderPlan(scrollNeeded, canScroll, availableWidthPx);

  const debugInfo = includeDebug || config.debugEnabled
    ? {
        availableWidthPx,
        availableHeightPx,
        notes: ['calculated from display minus reserved areas'],
      }
    : undefined;

  return {
    schemaVersion: 1,
    contentId: uuidv4(),
    validForSec: 60,
    priority,
    renderPlan,
    candidates,
    fallback: { type: 'text', text: '' },
    debug: debugInfo,
  };
}

// ---------------------------------------------------------------------------
// Plan content from a cached StoredEntry (pushed by an external service)
// ---------------------------------------------------------------------------

/**
 * Adapts cached content pushed by an external service to the device's display
 * dimensions, filling in any missing estimatedWidthPx values and computing a
 * fresh renderPlan.
 */
export function planFromStored(
  req: ContentRequest,
  stored: StoredEntry,
  includeDebug: boolean
): ContentResponse {
  const { display, clientCapabilities } = req;

  const availableWidthPx = display.widthPx - display.reservedLeftPx;
  const availableHeightPx = display.heightPx - display.reservedBottomPx;
  const canScroll = clientCapabilities?.canScroll ?? false;

  // Convert push candidates → response candidates, filling in estimatedWidthPx
  const candidates: Candidate[] = stored.candidates.map((c) => {
    if (c.type === 'text') {
      // Derive plain text: use explicit text, or join from segments
      const plainText =
        c.text ?? (c.segments?.map((s) => s.text).join('') ?? '');
      const textCandidate: TextCandidate = {
        id: c.id,
        type: 'text',
        text: plainText,
        estimatedWidthPx: c.estimatedWidthPx ?? estimateTextWidth(plainText),
        ...(c.color !== undefined ? { color: c.color } : {}),
        ...(c.segments !== undefined ? { segments: c.segments } : {}),
      };
      return textCandidate;
    }
    const bitmapCandidate: BitmapCandidate = {
      id: c.id,
      type: 'bitmap',
      widthPx: c.widthPx,
      heightPx: c.heightPx,
      frames: c.frames,
      ...(c.color !== undefined ? { color: c.color } : {}),
    };
    return bitmapCandidate;
  });

  // Scroll is needed when the widest text candidate exceeds available width
  const textWidths = candidates
    .filter((c): c is TextCandidate => c.type === 'text')
    .map((c) => c.estimatedWidthPx);
  const scrollNeeded =
    textWidths.length > 0 && textWidths.some((w) => w > availableWidthPx);

  const renderPlan = buildRenderPlan(scrollNeeded, canScroll, availableWidthPx);
  renderPlan.align = stored.align ?? 'left';

  // Remaining TTL (seconds) — used to decide how long the device should wait
  // before polling again.  Capped at 60 s so the device polls at most once per
  // minute, keeping the cache independent of the response hint.
  const remainingTtlSec = Math.max(
    0,
    Math.floor((stored.expiresAt - Date.now()) / 1000)
  );
  const validForSec = Math.min(60, remainingTtlSec);

  const debugInfo =
    includeDebug || config.debugEnabled
      ? {
          availableWidthPx,
          availableHeightPx,
          notes: ['served from pushed content cache'],
        }
      : undefined;

  return {
    schemaVersion: 1,
    contentId: uuidv4(),
    validForSec,
    priority: stored.priority,
    renderPlan,
    candidates,
    fallback: stored.fallback,
    debug: debugInfo,
  };
}
