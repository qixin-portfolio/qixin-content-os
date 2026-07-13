import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Phase 6A SQLite migration", () => {
  it("preserves existing ProjectSource fields, SourceItem links and foreign keys", () => {
    const root = mkdtempSync(join(tmpdir(), "qixin-phase6a-migration-"));
    const databasePath = join(root, "existing.db");
    const database = new Database(databasePath);
    database.pragma("foreign_keys = ON");
    database.exec(readFileSync("prisma/migrations/20260712110000_add_project_sources_and_traceability/migration.sql", "utf8"));
    database.prepare("INSERT INTO Project (id, name, slug, updatedAt) VALUES (?, ?, ?, ?)").run("project-existing", "既有项目", "existing", "2026-07-13T00:00:00.000Z");
    database.prepare("INSERT INTO ProjectSource (id, projectId, sourceType, sourceName, sourcePath, repository, metadataJson) VALUES (?, ?, ?, ?, ?, ?, ?)").run("source-existing", "project-existing", "markdown", "既有来源", "relative/source", "repository", "{\"kept\":true}");
    database.prepare("INSERT INTO SourceItem (id, projectId, projectSourceId, sourceType, title, content, sourcePath) VALUES (?, ?, ?, ?, ?, ?, ?)").run("item-existing", "project-existing", "source-existing", "markdown", "既有资料", "既有正文", "relative/item.md");

    database.exec(readFileSync("prisma/migrations/20260714090000_add_phase6a_obsidian_research/migration.sql", "utf8"));

    const source = database.prepare("SELECT id, projectId, sourceType, sourceName, sourcePath, repository, metadataJson FROM ProjectSource WHERE id = ?").get("source-existing");
    const item = database.prepare("SELECT projectSourceId, content FROM SourceItem WHERE id = ?").get("item-existing");
    const foreignKeyProblems = database.pragma("foreign_key_check");
    expect(source).toEqual({ id: "source-existing", projectId: "project-existing", sourceType: "markdown", sourceName: "既有来源", sourcePath: "relative/source", repository: "repository", metadataJson: "{\"kept\":true}" });
    expect(item).toEqual({ projectSourceId: "source-existing", content: "既有正文" });
    expect(foreignKeyProblems).toEqual([]);
    expect(database.prepare("SELECT COUNT(*) AS count FROM pragma_index_list('ScanRun') WHERE name = 'ScanRun_projectSourceId_startedAt_idx'").get()).toEqual({ count: 1 });
    expect(database.prepare("SELECT COUNT(*) AS count FROM pragma_index_list('TopicCandidateSource') WHERE name = 'TopicCandidateSource_sourceItemId_idx'").get()).toEqual({ count: 1 });
    database.close();
    rmSync(root, { recursive: true, force: true });
  });
});
