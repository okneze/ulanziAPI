import { z } from 'zod';

export const ViewSchema = z.enum(['onedigit', 'onedigit_dual']);

export const DisplaySchema = z.object({
  widthPx: z.number().int().positive().max(512),
  heightPx: z.number().int().positive().max(128),
  reservedLeftPx: z.number().int().min(0).max(256),
  reservedBottomPx: z.number().int().min(0).max(64),
});

export const TrendSchema = z.enum([
  'rising_fast',
  'rising',
  'flat',
  'falling',
  'falling_fast',
  'unknown',
]);

export const ContextSchema = z
  .object({
    bgValue: z.number().optional(),
    trend: TrendSchema.optional(),
    basalRate: z.number().optional(),
    iob: z.number().optional(),
    cob: z.number().optional(),
  })
  .optional();

export const ClientCapabilitiesSchema = z
  .object({
    canScroll: z.boolean().optional(),
    canAnimate: z.boolean().optional(),
    supportsBitmap: z.boolean().optional(),
    maxFps: z.number().int().positive().max(60).optional(),
  })
  .optional();

export const ContentRequestSchema = z.object({
  deviceId: z.string().min(1).max(128),
  view: ViewSchema,
  display: DisplaySchema,
  locale: z.string().min(2).max(20).optional(),
  time: z.string().datetime({ offset: true }).optional(),
  context: ContextSchema,
  clientCapabilities: ClientCapabilitiesSchema,
  debug: z.boolean().optional(),
});

export type ContentRequest = z.infer<typeof ContentRequestSchema>;
export type View = z.infer<typeof ViewSchema>;
export type DisplayConfig = z.infer<typeof DisplaySchema>;
export type Context = z.infer<typeof ContextSchema>;
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;
export type Trend = z.infer<typeof TrendSchema>;
