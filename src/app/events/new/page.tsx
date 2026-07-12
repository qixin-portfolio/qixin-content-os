"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

const fields = [
  { name: "projectId", label: "项目 ID", placeholder: "关联已有 Project 的 id" },
  { name: "title", label: "标题", placeholder: "这次真实发生了什么" },
  { name: "whatHappened", label: "发生了什么", placeholder: "只写可被证据支持的事实" },
  { name: "whyItMatters", label: "为什么做", placeholder: "这件事为什么重要" },
  { name: "problem", label: "遇到问题", placeholder: "过程中遇到的具体问题" },
  { name: "result", label: "结果", placeholder: "已完成到哪一步，不要写成超出事实的成果" },
  { name: "personalReflection", label: "个人感受", placeholder: "你的判断或复盘" },
  { name: "evidenceRequired", label: "证据说明", placeholder: "commit、截图、文档或其他可核验依据" },
];

export default function NewEventPage() {
  const [error, setError] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError([]);

    const formData = new FormData(event.currentTarget);
    const payload = Object.fromEntries(formData.entries());
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const result = (await response.json()) as { errors?: string[] };
      setError(result.errors ?? ["创建失败"]);
      setSubmitting(false);
      return;
    }

    window.location.href = "/events";
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link href="/events" className="text-sm text-zinc-500 hover:text-zinc-950">
        返回事件列表
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950">新建真实事件卡</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        没有证据、结果或个人感受的事件不会进入内容生成。
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        {fields.map((field) => (
          <label key={field.name} className="block">
            <span className="text-sm font-medium text-zinc-800">{field.label}</span>
            <textarea
              name={field.name}
              required
              rows={field.name === "title" || field.name === "projectId" ? 2 : 4}
              placeholder={field.placeholder}
              className="mt-2 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-zinc-950"
            />
          </label>
        ))}

        {error.length > 0 && (
          <div role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-zinc-200 pt-6">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "保存中..." : "保存事件卡"}
          </button>
          <Link href="/events" className="text-sm text-zinc-600 hover:text-zinc-950">
            取消
          </Link>
        </div>
      </form>
    </main>
  );
}
