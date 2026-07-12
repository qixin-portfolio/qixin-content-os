import { z } from "zod";

export const platformSchema = z.enum(["moments", "x", "xiaohongshu", "douyin"]);
export type Platform = z.infer<typeof platformSchema>;

export const publishStatusSchema = z.enum([
  "inbox",
  "selected",
  "drafting",
  "producing",
  "review",
  "ready",
  "published",
  "repurpose",
  "archived",
]);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const evidenceSchema = z.object({
  label: z.string().min(1),
  url: z.string().url().optional(),
  reference: z.string().min(1),
  approvedForPublication: z.boolean().default(false),
});

export const eventCardSchema = z.object({
  title: z.string().min(3),
  project: z.string().min(1),
  happened: z.string().min(10),
  motivation: z.string().min(5),
  problem: z.string().min(5),
  result: z.string().min(5),
  feeling: z.string().min(1),
  completionState: z.enum(["planned", "in_progress", "tested", "released"]),
  evidence: z.array(evidenceSchema).min(1),
});

export type EventCardInput = z.infer<typeof eventCardSchema>;
