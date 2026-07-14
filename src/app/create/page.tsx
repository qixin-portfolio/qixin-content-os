import { CreateWorkbench } from "./create-workbench";
import { getPrisma } from "@/lib/prisma";
import type { RecentProjectOption } from "@/lib/create/types";
import { hasRealGenerationProvider } from "@/lib/create/provider-factory";

export const dynamic = "force-dynamic";

function toProjectOption(event: {
  project: { name: string; slug: string };
  whatHappened: string;
  problem: string;
  result: string;
  personalReflection: string;
  status: string;
  createdAt: Date;
}): RecentProjectOption {
  return {
    name: event.project.name,
    summary: event.whatHappened,
    occurredAt: event.createdAt.toISOString(),
    status: event.status === "inbox" ? "资料待继续确认" : event.status,
    sourceText: [event.whatHappened, event.problem, event.result, event.personalReflection]
      .filter((item) => item.trim())
      .join("\n\n"),
    isDemo: event.project.slug === "transparent-construction",
  };
}

async function readProjectOptions() {
  const events = await getPrisma().eventCard.findMany({
    where: { sourceItems: { some: {} } },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { name: true, slug: true } } },
    take: 20,
  });
  const mapped = events.map(toProjectOption);
  const demoProject = mapped.find((item) => item.isDemo) ?? null;
  const seen = new Set<string>();
  const recentProjects = mapped.filter((item) => {
    if (item.isDemo || seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  }).slice(0, 5);
  return { recentProjects, demoProject };
}

export default async function CreatePage() {
  const { recentProjects, demoProject } = await readProjectOptions();
  return <CreateWorkbench recentProjects={recentProjects} demoProject={demoProject} realProviderConfigured={hasRealGenerationProvider()} />;
}
