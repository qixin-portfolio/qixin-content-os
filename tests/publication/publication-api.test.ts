import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPublicationPackage } from "../../src/lib/publication/package-service";
import {
  createPublicationTestContext,
  disposePublicationTestContext,
} from "./fixtures";

const prismaState = vi.hoisted(() => ({ value: undefined as PrismaClient | undefined }));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => {
    if (!prismaState.value) throw new Error("Publication API test PrismaClient is not initialized");
    return prismaState.value;
  },
}));

vi.mock("@/lib/publication/export-service", async () => (
  import("../../src/lib/publication/export-service")
));
vi.mock("@/lib/publication/checklist-service", async () => (
  import("../../src/lib/publication/checklist-service")
));
vi.mock("@/lib/publication/package-service", async () => (
  import("../../src/lib/publication/package-service")
));

import { POST as exportPackage } from "../../src/app/api/publication/[packageId]/export/route";
import { PATCH as updatePackage } from "../../src/app/api/publication/[packageId]/route";

describe("publication API downloads and boundaries", () => {
  let context: Awaited<ReturnType<typeof createPublicationTestContext>>;
  let packageId = "";

  beforeAll(async () => {
    context = await createPublicationTestContext("api");
    prismaState.value = context.prisma;
    packageId = (await createPublicationPackage(context.prisma, context.approvedDraftId)).package.id;
  });

  afterAll(async () => {
    prismaState.value = undefined;
    await disposePublicationTestContext(context);
  });

  it.each([
    ["txt", "text/plain; charset=utf-8", ".txt"],
    ["markdown", "text/markdown; charset=utf-8", ".md"],
    ["json", "application/json; charset=utf-8", ".json"],
  ] as const)("returns safe HTTP headers for %s", async (format, contentType, extension) => {
    const response = await exportPackage(
      new Request(`http://localhost/api/publication/${packageId}/export`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ format }),
      }),
      { params: Promise.resolve({ packageId }) },
    );
    const disposition = response.headers.get("content-disposition") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(disposition).toContain("attachment;");
    expect(disposition).toContain("filename=");
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).toContain(extension);
    expect(disposition).not.toContain("../");
    expect(response.headers.get("x-publication-export-id")).toBeTruthy();
    expect(response.headers.get("x-content-hash")).toMatch(/^[a-f0-9]{64}$/);
    await response.text();
  });

  it("does not allow PATCH to replace immutable fact boundaries", async () => {
    const before = await context.prisma.publicationPackage.findUniqueOrThrow({
      where: { id: packageId },
    });
    const response = await updatePackage(
      new Request(`http://localhost/api/publication/${packageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update_checklist",
          completedItemIds: [],
          factBoundaryJson: "{}",
          evidenceSnapshotJson: "{}",
          body: "绕过修改",
        }),
      }),
      { params: Promise.resolve({ packageId }) },
    );
    const after = await context.prisma.publicationPackage.findUniqueOrThrow({
      where: { id: packageId },
    });

    expect(response.status).toBe(200);
    expect(after.factBoundaryJson).toBe(before.factBoundaryJson);
    expect(after.evidenceSnapshotJson).toBe(before.evidenceSnapshotJson);
    expect(after.body).toBe(before.body);
    expect(after.packageHash).toBe(before.packageHash);
  });

  it("does not let the API bypass publication checks by directly sending published", async () => {
    const response = await updatePackage(
      new Request(`http://localhost/api/publication/${packageId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_status",
          status: "published",
          publishedAt: "2026-07-13T10:00:00.000Z",
        }),
      }),
      { params: Promise.resolve({ packageId }) },
    );
    const after = await context.prisma.publicationPackage.findUniqueOrThrow({
      where: { id: packageId },
    });

    expect(response.status).toBe(400);
    expect(after.status).toBe("exported");
    expect(after.publishedAt).toBeNull();
  });
});
