# ulanziAPI

External API that provides small content for LED displays — specifically for **Nightscout-Clock OneDigit Views** on Ulanzi pixel clocks.

## Project Goal

The API delivers context-aware content (text, numbers, short symbols, mini bitmaps) for small pixel surfaces in OneDigit watchfaces.  
The API is "intelligent" — it creates sized candidates, suggests scrolling, and prioritises content. The device makes the final rendering decision.

### Content flow

```
External service (Nightscout, HA, …)
        │
        │  POST /v1/content/push   ← push text/bitmap/color
        ▼
   [ ulanziAPI ]   ← caches content per deviceId + TTL
        │
        │  POST /v1/watchface/content   ← device polls
        ▼
   Display device (Ulanzi clock)
```

An **external service** (Nightscout bridge, Home Assistant, custom script, …) pushes content once it becomes available. The **device** polls the API regularly and always gets either the most recent pushed content or auto-generated fallback content.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| Node.js 20+ | Runtime |
| TypeScript | Type safety |
| Fastify 5 | HTTP framework |
| Zod | Schema validation |
| Vitest | Testing |
| pino | Structured logging |
| dotenv | Local environment |
| @fastify/swagger | OpenAPI/Swagger docs |
| Docker | Container (Railway) |

---

## Local Installation & Start

```bash
# 1. Clone
git clone https://github.com/okneze/ulanziAPI.git
cd ulanziAPI

# 2. Install dependencies
npm install

# 3. Copy env example
cp .env.example .env

# 4. Build TypeScript
npm run build

# 5. Start server
npm start
# → Server running on http://0.0.0.0:3000
# → Swagger UI at http://0.0.0.0:3000/docs
```

For development with auto-reload:

```bash
npm run dev
```

---

## Run Tests

```bash
npm test
```

For coverage:

```bash
npm run test:coverage
```

---

## API Examples (curl)

### Health check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "service": "ulanzi-api",
  "version": "1.0.0"
}
```

---

### Push content from an external service

An external service (Nightscout, Home Assistant, etc.) pushes content for a specific device. Content is cached for `ttlSec` seconds (default `60`, max `3600`). Up to **10 candidates** can be provided per push; order them from richest to most compact so the device can pick the best fit.

```bash
curl -X POST http://localhost:3000/v1/content/push \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "clock-123",
    "ttlSec": 60,
    "priority": "normal",
    "candidates": [
      {
        "id": "full_text",
        "type": "text",
        "text": "124→",
        "color": "#00FF00"
      },
      {
        "id": "short_text",
        "type": "text",
        "text": "124",
        "color": "#00FF00",
        "estimatedWidthPx": 13
      }
    ],
    "fallback": {
      "type": "text",
      "text": ""
    }
  }'
```

> **Note:** `fallback` is optional. When omitted the API defaults to `{ "type": "text", "text": "" }`.

Response (`201 Created`):
```json
{
  "stored": true,
  "deviceId": "clock-123",
  "expiresAt": "2026-03-15T10:31:00.000Z"
}
```

#### Push request field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | ✅ | Max 128 chars. Identifies the target device. |
| `ttlSec` | integer | — | Default `60`, max `3600`. Content is discarded after this period. Alias: `validForSec` is also accepted (mirrors the response field name). `ttlSec` takes precedence when both are supplied. |
| `priority` | string | — | `low` / `normal` / `high` / `critical`. Default `normal`. |
| `candidates` | array | ✅ | Min 1, max 10. Text and/or bitmap entries, richest first. |
| `fallback` | object | — | Shown if no candidate fits. Defaults to `{ "type": "text", "text": "" }` when omitted. |

**Text candidate fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Max 64 chars. Unique per push payload. |
| `type` | `"text"` | ✅ | |
| `text` | string | ✅* | Max 256 chars. *Required unless `segments` is provided. |
| `segments` | array | ✅* | Max 64 entries. *Required unless `text` is provided. Per-span colors (see [Color Support](#color-support)). |
| `color` | string | — | `#RRGGBB`. Default foreground color for the whole candidate. |
| `estimatedWidthPx` | integer | — | Auto-calculated from `text` length if omitted. |

**Bitmap candidate fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | ✅ | Max 64 chars. |
| `type` | `"bitmap"` | ✅ | |
| `widthPx` | integer | ✅ | Max 64. |
| `heightPx` | integer | ✅ | Max 32. |
| `frames` | array | ✅ | Min 1, max 16. Each frame is a hex-encoded 1-bit bitmap string. |
| `color` | string | — | `#RRGGBB`. Tint color applied to the bitmap. |

#### With bitmap + tint color

```bash
curl -X POST http://localhost:3000/v1/content/push \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "clock-123",
    "ttlSec": 30,
    "priority": "high",
    "candidates": [
      {
        "id": "alert_icon",
        "type": "bitmap",
        "widthPx": 8,
        "heightPx": 6,
        "frames": ["3C4242423C00"],
        "color": "#FF0000"
      },
      {
        "id": "alert_text",
        "type": "text",
        "text": "LOW",
        "color": "#FF0000"
      }
    ]
  }'
```

#### With per-segment (multi-color) text

Each segment in `segments` carries its own color. The `text` field can be omitted — it is automatically joined from the segment texts.

```bash
curl -X POST http://localhost:3000/v1/content/push \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "clock-123",
    "ttlSec": 60,
    "candidates": [
      {
        "id": "rainbow",
        "type": "text",
        "segments": [
          { "text": "H", "color": "#FF0000" },
          { "text": "e", "color": "#FF8800" },
          { "text": "l", "color": "#FFFF00" },
          { "text": "l", "color": "#00FF00" },
          { "text": "o", "color": "#0000FF" }
        ]
      }
    ]
  }'
```

The device receives a `segments` array alongside the joined `text: "Hello"` and renders each span in its own color.

---

### Device polls for content

The display device sends its capabilities. If pushed content is available for `deviceId`, the API returns it. Otherwise it auto-generates from `context`.

```bash
curl -X POST http://localhost:3000/v1/watchface/content \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "clock-123",
    "view": "onedigit",
    "display": {
      "widthPx": 32,
      "heightPx": 8,
      "reservedLeftPx": 5,
      "reservedBottomPx": 2
    },
    "locale": "de-DE",
    "time": "2026-03-15T10:30:00+01:00",
    "context": {
      "bgValue": 124,
      "trend": "flat"
    },
    "clientCapabilities": {
      "canScroll": true,
      "canAnimate": true,
      "supportsBitmap": true,
      "maxFps": 10
    }
  }'
```

#### Content request field reference

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | ✅ | Max 128 chars. Must match the `deviceId` used in the push call. |
| `view` | string | ✅ | `onedigit` or `onedigit_dual`. |
| `display` | object | ✅ | `widthPx`, `heightPx`, `reservedLeftPx`, `reservedBottomPx`. |
| `context` | object | — | `bgValue` (number), `trend`, `basalRate`, `iob`, `cob`. Used for auto-generated content. |
| `clientCapabilities` | object | — | `canScroll`, `canAnimate`, `supportsBitmap`, `maxFps`. |
| `locale` | string | — | BCP 47 locale, e.g. `de-DE`. |
| `time` | string | — | ISO-8601 timestamp with timezone offset. |

#### Auto-generated content response (no push cache)

When no pushed content is cached for the device, the API auto-generates from `context`:

```json
{
  "schemaVersion": 1,
  "contentId": "a1b2c3d4-...",
  "validForSec": 60,
  "priority": "low",
  "renderPlan": {
    "strategy": "best_fit_then_scroll",
    "scroll": {
      "enabled": false,
      "speedPxPerSec": 8,
      "pauseMs": 600,
      "loop": 1
    },
    "align": "left"
  },
  "candidates": [
    { "id": "full_text",  "type": "text", "text": "124→", "estimatedWidthPx": 25 },
    { "id": "short_text", "type": "text", "text": "124",  "estimatedWidthPx": 15 },
    { "id": "icon", "type": "bitmap", "widthPx": 8, "heightPx": 6, "frames": ["3C4242423C00"] }
  ],
  "fallback": { "type": "text", "text": "" }
}
```

#### Pushed-content response

When pushed content is available, the same shape is returned but `validForSec` is capped at `60` (so the device keeps polling every minute) and the candidates come from the push payload. Colors and segments are forwarded unchanged:

```json
{
  "schemaVersion": 1,
  "contentId": "e5f6a7b8-...",
  "validForSec": 58,
  "priority": "normal",
  "renderPlan": {
    "strategy": "best_fit_then_scroll",
    "scroll": { "enabled": false, "speedPxPerSec": 8, "pauseMs": 600, "loop": 1 },
    "align": "left"
  },
  "candidates": [
    {
      "id": "full_text",
      "type": "text",
      "text": "124→",
      "color": "#00FF00",
      "estimatedWidthPx": 25
    }
  ],
  "fallback": { "type": "text", "text": "" }
}
```

#### Response field reference

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | `1` | Always `1`. Used by the device to detect breaking changes. |
| `contentId` | string | UUID. A unique ID for this specific response. |
| `validForSec` | integer | How long the device should wait before polling again. Always `≤ 60` (capped so the device keeps polling every minute). The server-side `expiresAt` is the sole source of truth for cache lifetime. |
| `priority` | string | `low` / `normal` / `high` / `critical`. |
| `renderPlan` | object | Rendering hints — `strategy`, `scroll` config, and `align`. |
| `renderPlan.scroll.enabled` | boolean | `true` when the widest text candidate exceeds `availableWidthPx` and `canScroll` is `true`. |
| `candidates` | array | Ordered list of display options. Pick the widest one that fits. |
| `fallback` | object | Always present. `{ "type": "text", "text": "...", "color"? }`. |
| `debug` | object | Only present when `?debug=true` or `DEBUG_ENABLED=true`. |

**Text candidate fields in response:**

| Field | Type | Notes |
|---|---|---|
| `id` | string | Matches the `id` from the push payload (or `full_text` / `short_text` for auto-generated). |
| `type` | `"text"` | |
| `text` | string | Plain text string (joined from segments if segments-only push). |
| `estimatedWidthPx` | number | Estimated render width in pixels. |
| `color` | string | `#RRGGBB`. Present only when provided in the push payload. |
| `segments` | array | Present only when the push payload contained per-segment colors. Each entry: `{ "text": "...", "color"?: "#RRGGBB" }`. |

**Bitmap candidate fields in response:**

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `type` | `"bitmap"` | |
| `widthPx` | number | Width in pixels. |
| `heightPx` | number | Height in pixels. |
| `frames` | array | Hex-encoded 1-bit bitmap frames. |
| `color` | string | `#RRGGBB`. Tint color. Present only when provided in push. |

### Device poll with debug info

```bash
curl -X POST "http://localhost:3000/v1/watchface/content?debug=true" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "clock-123",
    "view": "onedigit_dual",
    "display": {
      "widthPx": 32,
      "heightPx": 8,
      "reservedLeftPx": 10,
      "reservedBottomPx": 2
    },
    "context": { "bgValue": 55, "trend": "falling_fast" }
  }'
```

The `?debug=true` query parameter adds a `debug` block to the response showing `availableWidthPx`, `availableHeightPx`, and notes (e.g. `"served from pushed content cache"`).

---

## Available Endpoints

| Method | Path | Caller | Description |
|---|---|---|---|
| GET | `/health` | Any | Health check |
| POST | `/v1/content/push` | **External service** | Push text/bitmap/color for a device |
| POST | `/v1/watchface/content` | **Display device** | Poll for content to render |
| GET | `/docs` | Any | Swagger UI |
| GET | `/docs/json` | Any | OpenAPI JSON spec |

---

## Color Support

Colors are specified as **6-digit hex strings** in `#RRGGBB` format.

| Example | Meaning |
|---|---|
| `#FF0000` | Red (alert) |
| `#00FF00` | Green (in-range) |
| `#FFFF00` | Yellow (warning) |
| `#FFFFFF` | White (default) |

Colors can be set on:
- **Text candidates** — foreground text color for the whole candidate
- **Bitmap candidates** — tint color applied to the 1-bit bitmap mask
- **Fallback** — fallback text color
- **Individual text segments** — per-span color overrides (see below)

The `color` field is always **optional**. If omitted, the device applies its default color.

```jsonc
// Text with a single color (whole candidate)
{ "id": "bg", "type": "text", "text": "124→", "color": "#00FF00" }

// Bitmap with tint color
{ "id": "icon", "type": "bitmap", "widthPx": 8, "heightPx": 6,
  "frames": ["3C4242423C00"], "color": "#FF0000" }
```

### Per-segment (multi-color) text

To display **different parts of a text in different colors**, use the `segments` array instead of (or alongside) the `text` field. Each segment specifies its own text slice and an optional color.

```jsonc
{
  "id": "colored_text",
  "type": "text",
  // "text" is optional — auto-joined from segments if omitted
  "segments": [
    { "text": "H", "color": "#FF0000" },   // red "H"
    { "text": "e", "color": "#FF8800" },   // orange "e"
    { "text": "llo", "color": "#FFFF00" }  // yellow "llo"
  ]
}
```

Rules:
- Either `text` **or** `segments` must be provided (both are accepted simultaneously).
- When `text` is omitted, it is auto-derived by joining all segment texts (`"Hello"` in the example above).
- A segment without a `color` **inherits** the candidate's top-level `color`. If neither is set, the device uses its default.
- `segments` are forwarded unchanged to the device response — the API does not render them.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Runtime environment |
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind host |
| `LOG_LEVEL` | `info` | Pino log level |
| `CORS_ORIGIN` | `*` | CORS allowed origin(s) |
| `API_KEY_OPTIONAL` | _(unset)_ | Reserved for future auth |
| `RATE_LIMIT_MAX` | `60` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms) |
| `CHAR_WIDTH_PX` | `4` | Default character width (px) |
| `CHAR_SPACING_PX` | `1` | Spacing between chars (px) |
| `DEBUG_ENABLED` | `false` | Always include debug block |

---

## Deployment on Railway

### Step-by-step

1. **Push to GitHub** — ensure all code is committed and pushed.

2. **Create Railway project**  
   - Go to [railway.app](https://railway.app)
   - Click **New Project** → **Deploy from GitHub Repo**
   - Select the `ulanziAPI` repository

3. **Railway auto-detects Dockerfile** — no extra config needed.

4. **Set environment variables** in Railway dashboard:
   ```
   NODE_ENV=production
   LOG_LEVEL=info
   CORS_ORIGIN=*
   RATE_LIMIT_MAX=60
   RATE_LIMIT_WINDOW_MS=60000
   ```
   > `PORT` is set automatically by Railway — do **not** override it.

5. **Verify healthcheck**  
   After deploy, open the Railway-assigned URL:
   ```
   GET https://<your-app>.railway.app/health
   ```
   Expected response: `{ "status": "ok", ... }`

6. **Swagger UI** is available at:
   ```
   https://<your-app>.railway.app/docs
   ```

---

## Core Logic

### Content priority

When a device polls `POST /v1/watchface/content`:

1. **Pushed content available?** → Return cached content from the external service (with renderPlan computed for the device's display)
2. **No pushed content / expired?** → Auto-generate from `context` (bgValue, trend)

### Available display area

```
availableWidthPx  = display.widthPx  - display.reservedLeftPx
availableHeightPx = display.heightPx - display.reservedBottomPx
```

The API uses the passed `display` block — it does **not** rely on hardcoded values.

### Views

| View | Typical `reservedLeftPx` | Available width (32px total) |
|---|---|---|
| `onedigit` | 5 | 27 px |
| `onedigit_dual` | 10 | 22 px |

### Candidate order (auto-generated)

1. **Full text** — e.g. `124→`
2. **Short text** — e.g. `124`
3. **Bitmap/Icon** — 8×6 px (if `supportsBitmap: true`)
4. **Fallback** — `--`

### Priority heuristic (blood glucose)

| BG value | Priority |
|---|---|
| < 60 or > 300 | `critical` |
| < 70 or > 250 | `high` |
| < 80 or > 180 | `normal` |
| Otherwise | `low` |

### Scroll recommendation

Scroll is **recommended** (`renderPlan.scroll.enabled: true`) when the widest text candidate's estimated width exceeds `availableWidthPx` **and** `clientCapabilities.canScroll` is `true`.  
The device makes the final decision.

### TTL / `validForSec`

`validForSec` in the poll response is always **`≤ 60`** — it tells the device when to poll again, not how long the pushed content remains valid. The server-side `expiresAt` (returned by `POST /v1/content/push`) is the sole source of truth for cache lifetime. Pushed content continues to be served on every poll until `now >= expiresAt`, regardless of the `validForSec` hint.

---

## Known Limits & Next Steps

| Area | Current | Next step |
|---|---|---|
| Content cache | In-memory, single process | Replace with Redis for multi-instance / persistence |
| Rate limiting | In-memory per deviceId/IP | Replace with Redis for multi-instance |
| Auth | Optional API key (ENV only, not enforced) | JWT or API key enforcement on push endpoint |
| Content types | BG value + trend | Add basal rate, IOB, COB views |
| Bitmap frames | Static placeholder | Real bitmap generator |
| Database | None | Store device preferences |
| Locale | Accepted but not used | Locale-aware formatting |
| Monitoring | pino logs | Add metrics (Prometheus / Datadog) |