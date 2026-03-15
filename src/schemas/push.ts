import { z } from 'zod';
import { PrioritySchema } from './response.js';

/**
 * Hex RGB color, e.g. #FF0000 for red.
 * Used to specify the foreground color of a text or bitmap candidate.
 */
export const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a 6-digit hex color like #FF0000 or #00ff80');

export const PushTextCandidateSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.literal('text'),
  /** Text to display */
  text: z.string().min(1).max(256),
  /** Foreground color in #RRGGBB format */
  color: HexColorSchema.optional(),
  /** Estimated render width in pixels — auto-calculated from text length if omitted */
  estimatedWidthPx: z.number().int().positive().optional(),
});

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

export const PushCandidateSchema = z.discriminatedUnion('type', [
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
