import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { IdeProvider } from "@/lib/ide-store";
import { FsProvider } from "@/lib/fs-store";
import { ConversationProvider } from "@/lib/conversation-store";
import { DiffProvider } from "@/lib/diff-store";
import { registerBuiltInTools } from "@/lib/agent/tools";
import { IdeShell } from "@/components/ide/IdeShell";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/ide/Logo";

registerBuiltInTools();

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PeakGravity IDE — AI code editor, your models" },
      {
        name: "description",
        content:
          "PeakGravity is a desktop AI code editor. Bring your own OpenAI, Anthropic, Gemini or OpenRouter key and let the agent edit, review and run your code.",
      },
      { property: "og:title", content: "PeakGravity IDE — AI code editor, your models" },
      {
        property: "og:description",
        content: "Desktop AI IDE with bring-your-own-key support for every major model provider.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-editor">
        <Logo size={48} className="animate-pulse text-muted-foreground" />
      </div>
    );
  }

  return (
    <IdeProvider>
      <FsProvider>
        <ConversationProvider>
          <DiffProvider>
            <IdeShell />
          </DiffProvider>
        </ConversationProvider>
      </FsProvider>
    </IdeProvider>
  );
}
