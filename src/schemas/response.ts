import { z } from 'zod';

export const PrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);

export const ScrollConfigSchema = z.object({
  enabled: z.boolean(),
  speedPxPerSec: z.number(),
  pauseMs: z.number(),
  loop: z.number(),
});

export const RenderPlanSchema = z.object({
  strategy: z.string(),
  scroll: ScrollConfigSchema,
  align: z.enum(['left', 'center', 'right']),
});

export const TextCandidateSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  text: z.string(),
  estimatedWidthPx: z.number(),
});

export const BitmapCandidateSchema = z.object({
  id: z.string(),
  type: z.literal('bitmap'),
  widthPx: z.number(),
  heightPx: z.number(),
  frames: z.array(z.string()),
});

export const CandidateSchema = z.discriminatedUnion('type', [
  TextCandidateSchema,
  BitmapCandidateSchema,
]);

export const FallbackSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

export const DebugInfoSchema = z
  .object({
    availableWidthPx: z.number(),
    availableHeightPx: z.number(),
    notes: z.array(z.string()),
  })
  .optional();

export const ContentResponseSchema = z.object({
  schemaVersion: z.literal(1),
  contentId: z.string(),
  validForSec: z.number(),
  priority: PrioritySchema,
  renderPlan: RenderPlanSchema,
  candidates: z.array(CandidateSchema),
  fallback: FallbackSchema,
  debug: DebugInfoSchema,
});

export type ContentResponse = z.infer<typeof ContentResponseSchema>;
export type Candidate = z.infer<typeof CandidateSchema>;
export type TextCandidate = z.infer<typeof TextCandidateSchema>;
export type BitmapCandidate = z.infer<typeof BitmapCandidateSchema>;
export type RenderPlan = z.infer<typeof RenderPlanSchema>;
export type Priority = z.infer<typeof PrioritySchema>;
export type DebugInfo = z.infer<typeof DebugInfoSchema>;
