import { z } from 'zod';
import { PrioritySchema } from './response.js';

/**
 * Hex RGB color, e.g. #FF0000 for red.
 * Used to specify the foreground color of a text or bitmap candidate.
 */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color like #FF0000 or #00ff80');

/**
 * A single colored text run within a multi-color text candidate.
 * Example: { text: "A", color: "#FF0000" } renders "A" in red.
 */
export const TextSegmentSchema = z.object({
  /** Text content of this segment */
  text: z.string().min(1).max(256),
  /** Foreground color for this segment in #RRGGBB format. Inherits the candidate color when omitted. */
  color: HexColorSchema.optional(),
});

export const PushTextCandidateSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.literal('text'),
    /**
     * Plain text to display. Required unless `segments` is provided, in which case
     * it is auto-joined from the segment texts.
     */
    text: z.string().min(1).max(256).optional(),
    /**
     * Ordered list of colored text segments for multi-color text rendering.
     * When provided, each segment is rendered in its own color.
     * If `text` is omitted, it is derived by concatenating all segment texts.
     */
    segments: z.array(TextSegmentSchema).min(1).max(64).optional(),
    /** Default foreground color for the whole candidate in #RRGGBB format */
    color: HexColorSchema.optional(),
    /** Estimated render width in pixels — auto-calculated from text length if omitted */
    estimatedWidthPx: z.number().int().positive().optional(),
  })
  .refine(
    (v) =>
      v.text !== undefined ||
      (v.segments !== undefined && v.segments.length > 0),
    { message: 'Either "text" or "segments" (with at least one entry) must be provided' }
  );

export const PushBitmapCandidateSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('bitmap'),
  widthPx: z.number().int().positive().max(64),
  heightPx: z.number().int().positive().max(32),
  /** Bitmap frames, each encoded as a hex string */
  frames: z.array(z.string().min(1)).min(1).max(16),
  /** Optional tint color applied to the bitmap in #RRGGBB format */
  color: HexColorSchema.optional(),
});

export const PushCandidateSchema = z.union([
  PushTextCandidateSchema,
  PushBitmapCandidateSchema,
]);

export const PushContentRequestSchema = z.object({
  /** Target device identifier */
  deviceId: z.string().min(1).max(128),
  /** How long (seconds) this content should be served before expiry. Max 1 hour. */
  ttlSec: z.number().int().positive().max(3600).default(60),
  /** Optional priority override; defaults to "normal" */
  priority: PrioritySchema.optional(),
  /**
   * Ordered list of display candidates.
   * Provide them from richest/widest to narrowest so the device can pick the
   * best fit for its available area.
   */
  candidates: z.array(PushCandidateSchema).min(1).max(10),
  /** Shown if no candidate fits */
  fallback: z
    .object({
      type: z.literal('text'),
      text: z.string().min(1).max(64),
      color: HexColorSchema.optional(),
    })
    .optional(),
});

export const PushContentResponseSchema = z.object({
  stored: z.literal(true),
  deviceId: z.string(),
  /** ISO-8601 timestamp when the stored content will expire */
  expiresAt: z.string().datetime(),
});

export type PushContentRequest = z.infer<typeof PushContentRequestSchema>;
export type PushContentResponse = z.infer<typeof PushContentResponseSchema>;
export type PushTextCandidate = z.infer<typeof PushTextCandidateSchema>;
export type PushBitmapCandidate = z.infer<typeof PushBitmapCandidateSchema>;
export type PushCandidate = z.infer<typeof PushCandidateSchema>;
export type TextSegment = z.infer<typeof TextSegmentSchema>;
