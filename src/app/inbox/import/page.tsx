"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Project = { id: string; name: string; slug: string };

export default function ImportInboxPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => response.json() as Promise<Project[]>)
      .then((items) => {
        setProjects(items);
        if (items[0]) setProjectId(items[0].id);
      })
      .catch(() => setError(["项目列表加载失败"]));
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setError([]);

    if (!file) {
      setError(["请选择 Markdown 文件"]);
      setSubmitting(false);
      return;
    }

    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("file", file);
    const response = await fetch("/api/inbox/import", { method: "POST", body: formData });
    const result = (await response.json()) as { errors?: string[]; sourceItem?: { title: string } };

    if (!response.ok) {
      setError(result.errors ?? ["导入失败"]);
    } else {
      setMessage(`已导入：${result.sourceItem?.title ?? file.name}`);
      setFile(null);
      event.currentTarget.reset();
    }

    setSubmitting(false);
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-950">
        返回项目
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950">导入 Markdown 素材</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        原文会保存为私有 SourceItem，后续事件卡必须保留来源关联。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <label className="block">
          <span className="text-sm font-medium text-zinc-800">项目</span>
          <select
            required
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="mt-2 block h-10 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950"
          >
            <option value="" disabled>
              请选择项目
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} · {project.slug}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-zinc-800">Markdown 文件</span>
          <input
            required
            type="file"
            accept=".md,.markdown,text/markdown"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700"
          />
        </label>

        {message && <p className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</p>}
        {error.length > 0 && (
          <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.map((item) => <p key={item}>{item}</p>)}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || projects.length === 0}
          className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "导入中..." : "导入素材"}
        </button>
      </form>
    </main>
  );
}
