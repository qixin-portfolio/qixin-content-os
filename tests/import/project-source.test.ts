import Database from "better-sqlite3";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const databasePath = join(tmpdir(), `qixin-content-os-project-source-${process.pid}.db`);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databasePath }) });

describe("ProjectSource relation", () => {
  beforeAll(() => {
    const database = new Database(databasePath);
    database.exec(
      readFileSync(
        "prisma/migrations/20260712110000_add_project_sources_and_traceability/migration.sql",
        "utf8",
      ),
    );
    database.exec(readFileSync("prisma/migrations/20260714090000_add_phase6a_obsidian_research/migration.sql", "utf8"));
    database.close();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    rmSync(databasePath, { force: true });
  });

  it("associates a ProjectSource and SourceItem with the same Project", async () => {
    const project = await prisma.project.create({
      data: { name: "Relation test", slug: `relation-test-${process.pid}` },
    });
    const projectSource = await prisma.projectSource.create({
      data: {
        projectId: project.id,
        sourceType: "markdown",
        sourceName: "README",
        sourcePath: "README.md",
      },
    });
    await prisma.sourceItem.create({
      data: {
        projectId: project.id,
        projectSourceId: projectSource.id,
        sourceType: "markdown",
        title: "README",
        content: "# Relation test",
      },
    });

    const loaded = await prisma.project.findUnique({
      where: { id: project.id },
      include: { projectSources: { include: { sourceItems: true } } },
    });

    expect(loaded?.projectSources[0].sourceItems[0].projectId).toBe(project.id);
  });
});
