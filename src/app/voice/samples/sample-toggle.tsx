"use client";

import { useRouter } from "next/navigation";

export function SampleToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  async function toggle() {
    await fetch(`/api/voice/samples/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !active }) });
    router.refresh();
  }
  return <button type="button" onClick={toggle} className="border border-zinc-300 px-2 py-1 text-xs">{active ? "停用" : "启用"}</button>;
}
