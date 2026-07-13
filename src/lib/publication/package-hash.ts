import { sha256, stableJson } from "./serialization.ts";

export type PublicationPackageHashInput = {
  platform: string;
  title: string | null;
  hook: string | null;
  body: string;
  cta: string | null;
  sourceRevisionId: string;
  approvalRevisionId: string;
  evidenceSnapshot: unknown;
  factBoundary: unknown;
  assetBrief: unknown;
  publishChecklist: unknown;
};

export function calculatePublicationPackageHash(input: PublicationPackageHashInput) {
  return sha256(stableJson({
    platform: input.platform,
    title: input.title,
    hook: input.hook,
    body: input.body,
    cta: input.cta,
    sourceRevisionId: input.sourceRevisionId,
    approvalRevisionId: input.approvalRevisionId,
    evidenceSnapshot: input.evidenceSnapshot,
    factBoundary: input.factBoundary,
    assetBrief: input.assetBrief,
    publishChecklist: input.publishChecklist,
  }));
}
