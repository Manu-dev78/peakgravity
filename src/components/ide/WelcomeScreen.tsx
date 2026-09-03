import { useState } from "react";
import { Folder, Copy, Cloud, Database, Braces } from "lucide-react";
import { Logo } from "./Logo";
import { useIde } from "@/lib/ide-store";
import { pickFolder } from "@/lib/electron-api";

const EXTENSIONS = [
  { name: "Cloud Data Tools", desc: "Query and explore cloud databases inside the IDE.", icon: Database },
  { name: "Deploy Anywhere", desc: "One-click deploys to your favourite hosting provider.", icon: Cloud },
  { name: "JSON & YAML Pro", desc: "Schema validation, formatting and folding.", icon: Braces },
];

export function WelcomeScreen() {
  const { recent, openWorkspace } = useIde();
  const [showAll, setShowAll] = useState(false);
  const list = showAll ? recent : recent.slice(0, 3);

  const handleOpenFolder = async () => {
    const res = await pickFolder();
    if (res) openWorkspace({ ...res, openedAt: Date.now() });
  };

  return (
    <div className="h-full overflow-y-auto bg-editor">
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center px-6 pb-16 pt-6">
        <Logo size={72} className="text-foreground" />
        <h1 className="mt-6 text-[26px] font-light tracking-wide text-foreground">PeakGravity IDE</h1>

        <div className="mt-14 flex w-full flex-col gap-3">
          <button
            onClick={handleOpenFolder}
            className="flex h-[62px] w-full items-center justify-center gap-3 rounded-[3px] bg-primary text-[17px] text-primary-foreground hover:bg-primary-hover"
          >
            <Folder size={20} /> Open Folder
          </button>
          <button className="flex h-[62px] w-full items-center justify-center gap-3 rounded-[3px] bg-secondary text-[17px] text-secondary-foreground hover:bg-accent">
            <Copy size={20} /> Clone Repository
          </button>
        </div>

        <section className="mt-14 w-full">
          <h2 className="mb-4 text-[16px] font-semibold text-foreground">Workspaces</h2>
          {list.length === 0 ? (
            <p className="rounded-[3px] border border-border bg-card px-4 py-5 text-[15px] text-muted-foreground">
              No recent workspaces yet. Open a folder to get started.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {list.map((ws) => (
                <button
                  key={ws.path}
                  onClick={() => openWorkspace({ ...ws, openedAt: Date.now() })}
                  className="w-full rounded-[3px] border border-border bg-card px-3 py-3 text-left hover:bg-accent"
                >
                  <div className="text-[17px] text-foreground">{ws.name}</div>
                  <div className="text-[15px] text-muted-foreground">{ws.path}</div>
                </button>
              ))}
            </div>
          )}
          {recent.length > 3 && (
            <button
              onClick={() => setShowAll((s) => !s)}
              className="mt-8 w-full text-center text-[17px] text-muted-foreground hover:text-foreground"
            >
              {showAll ? "Show Less" : "Show More..."}
            </button>
          )}
        </section>

        <section className="mt-16 w-full">
          <h2 className="mb-4 text-[16px] font-semibold text-foreground">Extensions</h2>
          <div className="flex flex-col gap-3">
            {EXTENSIONS.map(({ name, desc, icon: Icon }) => (
              <div
                key={name}
                className="flex items-center gap-4 rounded-[3px] border border-border bg-card px-4 py-3"
              >
                <Icon size={22} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] text-foreground">{name}</div>
                  <div className="truncate text-[14px] text-muted-foreground">{desc}</div>
                </div>
                <button className="rounded-[3px] border border-border bg-secondary px-4 py-1.5 text-[15px] hover:bg-accent">
                  Download
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
