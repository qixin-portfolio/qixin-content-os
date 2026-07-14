"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  clearCreateSession,
  copyCreateBody,
  createEmptySession,
  loadCreateSession,
  saveCreateSession,
  selectDraftForEditing,
  updateEditedContent,
} from "@/lib/create/session";
import type {
  CreateDraftCandidate,
  CreateSession,
  CreateSourceMode,
  CreateTopicCandidate,
  RecentProjectOption,
} from "@/lib/create/types";

type Props = { recentProjects: RecentProjectOption[]; demoProject: RecentProjectOption | null };

const sourceOptions: Array<{ mode: CreateSourceMode; mark: string; title: string; description: string }> = [
  { mode: "manual", mark: "写", title: "记录今天发生的事", description: "输入一句最近发生的事情、项目变化或者自己的想法。" },
  { mode: "project", mark: "选", title: "从最近项目里选", description: "从已有项目进展中找一件值得记录的事。" },
  { mode: "x", mark: "读", title: "从 X 收藏中找灵感", description: "从收藏长文里找到观点，再加入自己的经历和判断。" },
];

const inputExamples = [
  "今天透明工地又改了一版",
  "最近用 Codex 做了一个内容系统",
  "我发现 AI 让会思考的人差距更大了",
  "今天去西湖等台风，结果好像什么也没发生",
];

function stamped(session: CreateSession): CreateSession {
  return { ...session, updatedAt: new Date().toISOString() };
}

function sourceText(session: CreateSession) {
  return session.sourceMode === "project" ? session.selectedProject?.sourceText.trim() ?? "" : session.manualInput.trim();
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

function editingWarnings(body: string, sourceMode: CreateSourceMode | null) {
  const warnings: string[] = [];
  if (sourceMode === "manual") warnings.push("这部分来自你的临时输入，发布前请确认准确。");
  if (/(一定|绝对|百分百|必然|彻底改变)/.test(body)) warnings.push("这里的结论比较绝对。");
  if (/(上线|客户|收入|成交|用户数量)/.test(body)) warnings.push("这项结果还没有证据，请在发布前确认。");
  if (/(功能模块清单|产品一页纸|行业案例说明)/.test(body)) warnings.push("这一段有点像项目报告。");
  return Array.from(new Set(warnings)).slice(0, 3);
}

function StepLine({ currentStep }: { currentStep: CreateSession["currentStep"] }) {
  const steps = ["来源", "选题", "草稿", "编辑"];
  const activeIndex = ["source", "topics", "drafts", "editor"].indexOf(currentStep);
  return <ol className="create-steps" aria-label="创作进度">{steps.map((step, index) => <li key={step} data-active={index <= activeIndex}>{step}</li>)}</ol>;
}

export function CreateWorkbench({ recentProjects, demoProject }: Props) {
  const [session, setSession] = useState<CreateSession>(() => createEmptySession());
  const [hydrated, setHydrated] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState<"topics" | "drafts" | null>(null);
  const [previewDraftKey, setPreviewDraftKey] = useState<CreateDraftCandidate["key"]>("record");
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const restored = loadCreateSession(window.localStorage);
      setSession(restored.session);
      setHydrated(true);
      if (restored.error) setStatusMessage(restored.error);
      else if (restored.restored) setStatusMessage("已恢复上次未完成的创作。");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const result = saveCreateSession(window.localStorage, session);
    const timer = window.setTimeout(() => {
      setSaveMessage(result.ok ? "已自动保存在本机" : result.error);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [hydrated, session]);

  useEffect(() => {
    if (session.currentStep === "editor") editorRef.current?.focus();
  }, [session.currentStep]);

  const previewDraft = useMemo(
    () => session.draftCandidates.find((draft) => draft.key === previewDraftKey) ?? session.draftCandidates[0] ?? null,
    [previewDraftKey, session.draftCandidates],
  );
  const hasDownstreamWork = session.topicCandidates.length > 0 || session.draftCandidates.length > 0 || Boolean(session.editedContent.trim());

  function chooseSource(mode: CreateSourceMode) {
    if (mode !== session.sourceMode && hasDownstreamWork && !window.confirm("更换来源会清空当前选题和草稿。")) return;
    setErrorMessage("");
    setStatusMessage("");
    setSession(stamped({ ...createEmptySession(), sourceMode: mode, manualInput: mode === "manual" ? session.manualInput : "" }));
  }

  function selectProject(project: RecentProjectOption) {
    setSession((current) => stamped({
      ...current,
      sourceMode: "project",
      selectedProject: project,
      topicCandidates: [],
      selectedTopic: null,
      draftCandidates: [],
      selectedDraft: null,
      editedContent: "",
      currentStep: "source",
    }));
    setStatusMessage(project.isDemo ? "演示案例，不代表当前推荐发布内容。" : "");
  }

  async function requestTopics() {
    const text = sourceText(session);
    if (!text) { setErrorMessage("先写下一句话，生成结果会更具体。"); return; }
    setLoading("topics");
    setErrorMessage("");
    try {
      const response = await fetch("/api/create/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceMode: session.sourceMode, sourceText: text, platform: "wechat_moments" }),
      });
      const result = await response.json() as { topics?: CreateTopicCandidate[]; errors?: string[] };
      if (!response.ok || !result.topics) throw new Error(result.errors?.[0] ?? "暂时没找到合适选题，请重试");
      setSession((current) => stamped({
        ...current,
        topicCandidates: result.topics ?? [],
        selectedTopic: null,
        draftCandidates: [],
        selectedDraft: null,
        currentStep: "topics",
      }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "暂时没找到合适选题，请重试");
    } finally { setLoading(null); }
  }

  async function requestDrafts() {
    if (!session.selectedTopic) { setErrorMessage("先选择一个想写的方向。"); return; }
    if (session.editedContent.trim() && !window.confirm("重新生成会替换候选稿，但不会删除你当前保存的人工版本。")) return;
    setLoading("drafts");
    setErrorMessage("");
    try {
      const response = await fetch("/api/create/drafts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceMode: session.sourceMode,
          sourceText: sourceText(session),
          topic: session.selectedTopic,
          platform: "wechat_moments",
        }),
      });
      const result = await response.json() as { drafts?: CreateDraftCandidate[]; errors?: string[] };
      if (!response.ok || !result.drafts) throw new Error(result.errors?.[0] ?? "候选稿生成失败，请重试");
      setPreviewDraftKey("record");
      setSession((current) => stamped({ ...current, draftCandidates: result.drafts ?? [], selectedDraft: null, currentStep: "drafts" }));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "候选稿生成失败，请重试");
    } finally { setLoading(null); }
  }

  function adoptDraft(draft: CreateDraftCandidate) {
    if (session.editedContent.trim() && session.editedContent !== draft.body
      && !window.confirm("使用另一版会替换编辑器内容，当前人工修改仍保留到你确认这一刻。")) return;
    setSession((current) => selectDraftForEditing(current, draft));
    setErrorMessage("");
    setStatusMessage("");
  }

  function updateEditor(value: string) {
    setSession((current) => ({ ...updateEditedContent(current, value), lightweightWarnings: editingWarnings(value, current.sourceMode) }));
  }

  async function copyBody() {
    if (!session.editedContent.trim()) { setErrorMessage("编辑器还是空的，先写下要复制的正文。"); return false; }
    const result = await copyCreateBody(navigator.clipboard, session.editedContent);
    if (result.ok) {
      setStatusMessage("已复制，可以去朋友圈发布了。");
      setErrorMessage("");
      return true;
    }
    setErrorMessage(result.error);
    return false;
  }

  function resetSession() {
    clearCreateSession(window.localStorage);
    skipNextSaveRef.current = true;
    setSession(createEmptySession());
    setStatusMessage("");
    setErrorMessage("");
    setSaveMessage("");
  }

  function confirmClear() {
    if (window.confirm("清空后无法恢复，确定清空本次创作吗？")) resetSession();
  }

  async function copyAndClear() {
    const copied = await copyBody();
    if (copied && window.confirm("文案已复制。现在清空本机保存的这次创作吗？")) resetSession();
  }

  return (
    <main className="create-shell">
      <header className="create-header">
        <div><p className="create-kicker">齐鑫 Content OS</p><h1>今天想写点什么？</h1></div>
        <div className="create-header-actions">
          <button type="button" className="create-text-button" onClick={confirmClear}>清空本次创作</button>
          <details className="create-more"><summary>更多</summary><nav aria-label="高级功能">
            <Link href="/editorial">编辑工作台</Link><Link href="/publication">发布归档</Link><Link href="/opportunities">选题库</Link><Link href="/projects">素材来源</Link>
          </nav></details>
        </div>
      </header>
      <StepLine currentStep={session.currentStep} />
      {(statusMessage || errorMessage) && <div className="create-live-region" aria-live="polite">
        {statusMessage && <p className="create-status">{statusMessage}</p>}
        {errorMessage && <p className="create-error">{errorMessage}</p>}
      </div>}

      <section className="create-section" aria-labelledby="source-heading">
        <div className="create-section-heading"><span>01</span><div><h2 id="source-heading">选择一个开始方式</h2><p>不用先整理资料，先从眼前这件事开始。</p></div></div>
        <div className="create-source-list">{sourceOptions.map((option) => (
          <button key={option.mode} type="button" className="create-source-option" data-selected={session.sourceMode === option.mode} onClick={() => chooseSource(option.mode)} aria-pressed={session.sourceMode === option.mode}>
            <span className="create-source-mark" aria-hidden="true">{option.mark}</span><span><strong>{option.title}</strong><small>{option.description}</small></span><span aria-hidden="true">→</span>
            {option.mode === "x" && <span className="sr-only">X 收藏研究库尚未接入当前版本</span>}
          </button>
        ))}</div>

        {session.sourceMode === "manual" && <div className="create-source-panel">
          <label htmlFor="manual-input">写下一句话、一个变化，或者最近冒出来的想法。</label>
          <textarea id="manual-input" value={session.manualInput} onChange={(event) => setSession((current) => stamped({ ...current, manualInput: event.target.value }))} placeholder={inputExamples.join("\n")} rows={6} />
          {session.manualInput.trim() && session.manualInput.trim().length < 12 && <p className="create-hint">再补一句发生了什么，生成结果会更具体。你也可以先继续。</p>}
          <button type="button" className="create-primary" onClick={requestTopics} disabled={loading !== null}>{loading === "topics" ? "正在整理三个选题…" : "推荐选题"}</button>
        </div>}

        {session.sourceMode === "project" && <div className="create-source-panel">
          {recentProjects.length === 0 ? <p className="create-empty">还没有可用于创作的真实项目记录。可以先切换到手动输入。</p> : <div className="create-project-list">{recentProjects.map((project) => (
            <button key={`${project.name}-${project.occurredAt}`} type="button" onClick={() => selectProject(project)} data-selected={session.selectedProject?.name === project.name}>
              <strong>{project.name}</strong><span>{project.summary}</span><small>{displayDate(project.occurredAt)} · {project.status}</small>
            </button>
          ))}</div>}
          {session.selectedProject && <button type="button" className="create-primary" onClick={requestTopics} disabled={loading !== null}>{loading === "topics" ? "正在整理三个选题…" : "推荐选题"}</button>}
        </div>}

        {session.sourceMode === "x" && <div className="create-source-panel create-empty"><strong>X 收藏研究库尚未接入当前版本</strong><p>暂时可以复制一段内容到手动输入框。</p><button type="button" className="create-secondary" onClick={() => chooseSource("manual")}>转到手动输入</button></div>}
        {demoProject ? <details className="create-demo"><summary>查看流程演示</summary><div><p>演示案例，不代表当前推荐发布内容。</p><button type="button" onClick={() => selectProject(demoProject)}>载入透明工地资料整理</button></div></details> : <p className="create-demo-muted">查看流程演示</p>}
      </section>

      {session.topicCandidates.length > 0 && <section className="create-section" aria-labelledby="topics-heading">
        <div className="create-section-heading"><span>02</span><div><h2 id="topics-heading">选一个值得写的方向</h2><p>三条都来自同一件事，只是切入点不同。</p></div></div>
        <div className="create-topic-list" role="radiogroup" aria-label="候选选题">{session.topicCandidates.map((topic) => (
          <label key={topic.key} data-selected={session.selectedTopic?.key === topic.key}>
            <input type="radio" name="topic" checked={session.selectedTopic?.key === topic.key} onChange={() => setSession((current) => stamped({ ...current, selectedTopic: topic }))} />
            <span><strong>{topic.title}</strong><small><b>为什么值得写</b>{topic.whyWorthWriting}</small><small><b>推荐切入</b>{topic.recommendedAngle}</small><small><b>适合平台</b>{topic.platform}</small><small className="create-missing"><b>真实信息</b>{topic.missingInformation}</small></span>
          </label>
        ))}</div>
        <div className="create-section-actions"><button type="button" className="create-secondary" onClick={() => setSession((current) => stamped({ ...current, currentStep: "source" }))}>返回来源</button><button type="button" className="create-primary" onClick={requestDrafts} disabled={loading !== null || !session.selectedTopic}>{loading === "drafts" ? "正在生成三种表达…" : "生成 3 个候选稿"}</button></div>
      </section>}

      {session.draftCandidates.length > 0 && <section className="create-section" aria-labelledby="drafts-heading">
        <div className="create-section-heading"><span>03</span><div><h2 id="drafts-heading">先挑一版接近你的</h2><p>没有最佳版本，挑一版再自己改。</p></div></div>
        <div className="create-draft-tabs" role="tablist" aria-label="朋友圈候选稿">{session.draftCandidates.map((draft) => <button key={draft.key} type="button" role="tab" aria-selected={previewDraft?.key === draft.key} onClick={() => setPreviewDraftKey(draft.key)}>{draft.name}</button>)}</div>
        {previewDraft && <article className="create-draft-preview" role="tabpanel"><p className="create-draft-difference">{previewDraft.difference}</p><div>{previewDraft.body}</div><button type="button" className="create-primary" onClick={() => adoptDraft(previewDraft)}>选择此版本</button></article>}
        <div className="create-section-actions"><button type="button" className="create-secondary" onClick={() => setSession((current) => stamped({ ...current, currentStep: "topics" }))}>返回选题</button><button type="button" className="create-text-button" onClick={requestDrafts} disabled={loading !== null}>重新生成</button></div>
      </section>}

      {session.currentStep === "editor" && session.selectedDraft && <section className="create-section create-editor-section" aria-labelledby="editor-heading">
        <div className="create-section-heading"><span>04</span><div><h2 id="editor-heading">改成你真正会发的样子</h2><p>{session.selectedDraft.name} · {session.selectedDraft.difference}</p></div></div>
        <textarea ref={editorRef} className="create-editor" aria-label="最终朋友圈正文" value={session.editedContent} onChange={(event) => updateEditor(event.target.value)} rows={16} />
        <p className="create-save-state">{saveMessage || "本地保存准备中…"}</p>
        <div className="create-advice-grid"><div><h3>轻量提示</h3>{session.lightweightWarnings.length > 0 ? <ul>{session.lightweightWarnings.slice(0, 3).map((warning) => <li key={warning}>{warning}</li>)}</ul> : <p>未发现明显事实风险。</p>}</div><div><h3>配图建议</h3><ul>{session.assetSuggestions.slice(0, 2).map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul></div></div>
        <details className="create-safety"><summary>查看来源与安全检查</summary><div className="create-safety-grid">
          <section><h3>内容来自哪里</h3><p>{session.selectedDraft.safety.sourceSummary}</p></section><section><h3>尚未确认</h3><ul>{session.selectedDraft.safety.unconfirmedFacts.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>隐私风险</h3><ul>{session.selectedDraft.safety.privacyRisks.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>配图注意</h3><ul>{session.selectedDraft.safety.imageNotes.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div></details>
        <div className="create-final-actions"><div><button type="button" className="create-secondary" onClick={() => setSession((current) => stamped({ ...current, currentStep: "drafts" }))}>返回修改</button><button type="button" className="create-text-button" onClick={copyAndClear}>复制并清空</button></div><button type="button" className="create-primary create-copy" onClick={copyBody}>复制文案</button></div>
        <p className="create-not-published">复制只会写入剪贴板，不会自动发布或写入数据库。</p>
      </section>}
    </main>
  );
}
