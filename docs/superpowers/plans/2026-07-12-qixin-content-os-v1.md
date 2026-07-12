# Qixin Content OS V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first content operating system that turns verified project evidence into one master story and four platform-ready variants.

**Architecture:** Next.js owns the UI and server actions. Prisma with SQLite stores projects, source items, event cards, content and publication records. Pure TypeScript domain functions perform fact-preserving transformations, while provider adapters isolate GitHub and AI integrations.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Prisma, SQLite, Zod, Vitest.

## Global Constraints

- Never fabricate metrics, completion state, launch state, customer feedback or commercial results.
- User-authored content must never be silently overwritten by generated content.
- Assets are private by default and require explicit publication approval.
- V1 exports publication packages; it does not auto-publish.
- Local-first storage is mandatory for V1.

---

### Task 1: Repository baseline and domain contract

**Files:**
- Create: `src/lib/content/schema.ts`
- Create: `src/lib/content/schema.test.ts`
- Create: `prisma/schema.prisma`
- Modify: `package.json`

**Interfaces:**
- Produces: `EventCardInput`, `Platform`, `PublishStatus`, `eventCardSchema`.

- [ ] Write tests proving incomplete facts, unsupported platforms and unsafe publication state are rejected.
- [ ] Run `npm test` and confirm the tests fail before implementation.
- [ ] Implement Zod schemas and matching Prisma entities.
- [ ] Run `npm test`, `npm run lint` and `npm run build`.
- [ ] Commit with `feat: establish content domain baseline`.

### Task 2: Fact-preserving content pipeline

**Files:**
- Create: `src/lib/content/pipeline.ts`
- Create: `src/lib/content/pipeline.test.ts`

**Interfaces:**
- Consumes: `EventCardInput`.
- Produces: `createDraftBundle(event): DraftBundle` with master, moments, x, xiaohongshu and douyin drafts.

- [ ] Write tests proving every generated platform draft retains the same completion state and evidence references.
- [ ] Run the focused test and verify failure.
- [ ] Implement deterministic draft generation without an external AI provider.
- [ ] Verify tests, lint and build.
- [ ] Commit with `feat: add fact preserving draft pipeline`.

### Task 3: Dashboard and inbox shell

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/components/dashboard/stat-card.tsx`
- Create: `src/components/dashboard/work-queue.tsx`

**Interfaces:**
- Consumes: static seed values matching future Prisma queries.
- Produces: responsive dashboard showing inbox, drafting, review and ready counts.

- [ ] Add component tests or pure rendering data tests.
- [ ] Build dashboard shell with honest empty states.
- [ ] Run lint and production build.
- [ ] Commit with `feat: add content operations dashboard`.

### Task 4: Seed data and first end-to-end sample

**Files:**
- Create: `prisma/seed.ts`
- Create: `src/lib/content/sample.ts`
- Create: `src/app/content/sample/page.tsx`

**Interfaces:**
- Produces: one transparent-construction sample that links evidence, event facts, master content and four variants.

- [ ] Add a regression test asserting the sample says “security hardening completed” but does not claim public commercial launch.
- [ ] Add the seed and sample detail screen.
- [ ] Run tests, lint, Prisma validation and build.
- [ ] Commit with `feat: add first evidence based content package`.

### Task 5: GitHub source adapter boundary

**Files:**
- Create: `src/lib/github/types.ts`
- Create: `src/lib/github/normalize-commit.ts`
- Create: `src/lib/github/normalize-commit.test.ts`
- Create: `.env.example`

**Interfaces:**
- Produces: `normalizeCommit(input): SourceItemDraft`.

- [ ] Write tests for title, repository, SHA, URL, date and evidence classification.
- [ ] Implement normalization without embedding credentials.
- [ ] Verify all quality gates.
- [ ] Commit with `feat: add github source normalization`.

### Task 6: Export package

**Files:**
- Create: `src/lib/publishing/export-package.ts`
- Create: `src/lib/publishing/export-package.test.ts`
- Create: `src/app/api/export/sample/route.ts`

**Interfaces:**
- Produces: a UTF-8 Markdown publication package containing master facts, four variants, evidence and a privacy checklist.

- [ ] Write export snapshot assertions.
- [ ] Implement Markdown export and sample download route.
- [ ] Run tests, lint and build.
- [ ] Commit with `feat: export reviewed publication packages`.
