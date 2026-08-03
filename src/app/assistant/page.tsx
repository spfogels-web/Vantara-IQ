import { PageShell } from "@/components/common/page-shell";
import { AssistantView } from "@/components/assistant/assistant-view";

export const metadata = { title: "AI assistant · Vantara IQ" };

export default function AssistantPage() {
  return (
    <PageShell
      eyebrow="Intelligence"
      title="AI assistant"
      description="Your smartest project engineer — reads everything, decides nothing."
    >
      <AssistantView />
    </PageShell>
  );
}
