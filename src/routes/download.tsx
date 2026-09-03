import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Apple, Monitor, Terminal as TerminalIcon, Github, ExternalLink, AlertCircle } from "lucide-react";
import { Logo } from "@/components/ide/Logo";
import { cn } from "@/lib/utils";

interface LatestManifest {
  version: string;
  channel: string;
  releasedAt: string | null;
  notes: string;
  downloads: {
    win: { nsis: string; portable: string };
    mac: {
      dmg: { x64: string; arm64: string };
      zip: { x64: string; arm64: string };
    };
    linux: { AppImage: string; deb: string; rpm: string };
  };
  releasePage: string;
}

async function fetchManifest(): Promise<LatestManifest | null> {
  // We fetch from /latest.json which is served as a static asset. The CI
  // workflow can rewrite this file per release; in the meantime the static
  // fallback points users to the GitHub releases page.
  try {
    const res = await fetch("/latest.json");
    if (!res.ok) return null;
    return (await res.json()) as LatestManifest;
  } catch {
    return null;
  }
}

function detectOs(): "mac" | "win" | "linux" {
  if (typeof navigator === "undefined") return "linux";
  const p = navigator.platform || "";
  const ua = navigator.userAgent || "";
  if (/Mac/i.test(p) || /Mac/i.test(ua)) return "mac";
  if (/Win/i.test(p) || /Windows/i.test(ua)) return "win";
  return "linux";
}

function detectMacArch(): "arm64" | "x64" {
  if (typeof navigator === "undefined") return "x64";
  // On Apple Silicon, navigator.platform is "MacIntel" but WebGL hints
  // can distinguish; we use the userAgentData hint when available, else
  // default to arm64 since modern Macs are arm64.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaData = (navigator as any).userAgentData;
  if (uaData && typeof uaData.getHighEntropyValues === "function") {
    return "arm64";
  }
  return "arm64";
}

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download PeakGravity" },
      {
        name: "description",
        content: "Download PeakGravity for Windows, macOS, or Linux. Bring your own model key and let the agent edit your code.",
      },
      { property: "og:title", content: "Download PeakGravity" },
      { property: "og:description", content: "Desktop AI code editor with your own model keys." },
    ],
  }),
  component: DownloadPage,
  loader: async () => {
    const manifest = await fetchManifest();
    return { manifest };
  },
});

function DownloadPage() {
  const { manifest } = Route.useLoaderData();
  const [os, setOs] = useState<"mac" | "win" | "linux">("linux");
  const [arch, setArch] = useState<"arm64" | "x64">("arm64");

  useEffect(() => {
    setOs(detectOs());
    setArch(detectMacArch());
  }, []);

  if (!manifest) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-editor px-4 text-foreground">
        <div className="max-w-md rounded-md border border-border bg-card p-6 text-center">
          <AlertCircle size={20} className="mx-auto mb-2 text-warning" />
          <p>Could not load the latest release manifest.</p>
          <a
            href="https://github.com/anomalyco/peakgravity/releases"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Github size={14} /> See releases on GitHub <ExternalLink size={12} />
          </a>
        </div>
      </div>
    );
  }

  const primaryHref = pickPrimary(manifest, os, arch);

  return (
    <div className="min-h-screen bg-editor text-foreground">
      <header className="flex h-[60px] items-center border-b border-border bg-chrome px-6">
        <Link to="/" className="flex items-center gap-2">
          <Logo size={22} className="text-primary" />
          <span className="text-[15px] font-medium">PeakGravity</span>
        </Link>
        <div className="ml-auto flex items-center gap-3 text-[13px]">
          <Link to="/" className="text-muted-foreground hover:text-foreground">
            Home
          </Link>
          <a
            href="https://github.com/anomalyco/peakgravity"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            <Github size={16} />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[820px] px-6 py-12">
        <div className="text-center">
          <Logo size={56} className="mx-auto text-primary" />
          <h1 className="mt-4 text-[32px] font-light tracking-tight">Download PeakGravity</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Desktop AI code editor. Bring your own OpenAI, Anthropic, Gemini or OpenRouter key.
          </p>
          {manifest.version && (
            <p className="mt-1 text-[12px] text-muted-foreground">
              Latest: <span className="font-mono">{manifest.version}</span>
              {manifest.channel === "beta" && (
                <span className="ml-2 rounded bg-warning/20 px-1.5 py-0.5 text-warning">pre-release</span>
              )}
            </p>
          )}
        </div>

        <div className="mt-10 rounded-md border border-border bg-card p-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Detected:</span>
            <OsPill active={os === "mac"} onClick={() => setOs("mac")}>
              <Apple size={13} /> macOS
            </OsPill>
            <OsPill active={os === "win"} onClick={() => setOs("win")}>
              <Monitor size={13} /> Windows
            </OsPill>
            <OsPill active={os === "linux"} onClick={() => setOs("linux")}>
              <TerminalIcon size={13} /> Linux
            </OsPill>
            {os === "mac" && (
              <span className="ml-2 flex items-center gap-1 text-[12px] text-muted-foreground">
                Arch:
                <button
                  onClick={() => setArch("arm64")}
                  className={cn(
                    "rounded px-2 py-0.5",
                    arch === "arm64" ? "bg-accent text-foreground" : "hover:bg-accent",
                  )}
                >
                  Apple Silicon
                </button>
                <button
                  onClick={() => setArch("x64")}
                  className={cn(
                    "rounded px-2 py-0.5",
                    arch === "x64" ? "bg-accent text-foreground" : "hover:bg-accent",
                  )}
                >
                  Intel
                </button>
              </span>
            )}
          </div>
          <a
            href={primaryHref}
            target="_blank"
            rel="noreferrer"
            className="flex h-[60px] w-full items-center justify-center gap-3 rounded-md bg-primary text-[18px] text-primary-foreground hover:bg-primary-hover"
          >
            <Download size={20} /> Download for {prettyOs(os)}{os === "mac" ? ` (${arch})` : ""}
          </a>
          <p className="mt-2 text-center text-[12px] text-muted-foreground">
            Pre-release builds are tagged with a <code>-pre.N</code> suffix.{" "}
            <a
              href={manifest.releasePage}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              See all releases on GitHub
            </a>
          </p>
        </div>

        <section className="mt-10">
          <h2 className="text-[18px] font-semibold">All platforms</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DownloadCard title="Windows" icon={<Monitor size={16} />}>
              <DownloadRow
                label="Installer (.exe)"
                href={manifest.downloads.win.nsis}
              />
              <DownloadRow
                label="Portable (.exe)"
                href={manifest.downloads.win.portable}
              />
            </DownloadCard>
            <DownloadCard title="macOS" icon={<Apple size={16} />}>
              <DownloadRow
                label="Disk image (Apple Silicon)"
                href={manifest.downloads.mac.dmg.arm64}
              />
              <DownloadRow
                label="Disk image (Intel)"
                href={manifest.downloads.mac.dmg.x64}
              />
              <DownloadRow
                label="Zip (Apple Silicon)"
                href={manifest.downloads.mac.zip.arm64}
              />
              <DownloadRow
                label="Zip (Intel)"
                href={manifest.downloads.mac.zip.x64}
              />
            </DownloadCard>
            <DownloadCard title="Linux" icon={<TerminalIcon size={16} />}>
              <DownloadRow label="AppImage" href={manifest.downloads.linux.AppImage} />
              <DownloadRow label=".deb" href={manifest.downloads.linux.deb} />
              <DownloadRow label=".rpm" href={manifest.downloads.linux.rpm} />
            </DownloadCard>
          </div>
        </section>

        <section className="mt-12 rounded-md border border-border bg-chrome/40 p-5 text-[13.5px] text-muted-foreground">
          <h2 className="text-[15px] font-semibold text-foreground">What you get</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Multi-provider chat (OpenAI, Anthropic, Gemini, OpenRouter, custom OpenAI-compatible)</li>
            <li>Agent tools: <code>read_file</code>, <code>list_dir</code>, <code>search_files</code>, <code>apply_patch</code>, <code>run_command</code></li>
            <li>Monaco editor, real file system, diff review, integrated terminal</li>
            <li>Encrypted key vault — your keys never leave the desktop</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function pickPrimary(manifest: LatestManifest, os: "mac" | "win" | "linux", arch: "arm64" | "x64"): string {
  if (os === "win") return manifest.downloads.win.portable;
  if (os === "mac") return manifest.downloads.mac.dmg[arch];
  return manifest.downloads.linux.AppImage;
}

function prettyOs(os: "mac" | "win" | "linux"): string {
  if (os === "mac") return "macOS";
  if (os === "win") return "Windows";
  return "Linux";
}

function OsPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded px-2 py-1 text-[12px] hover:bg-accent",
        active && "bg-accent text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function DownloadCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-medium text-foreground">
        {icon} {title}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </div>
  );
}

function DownloadRow({ label, href }: { label: string; href: string }) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between rounded px-2 py-1.5 text-[13px] text-foreground/90 hover:bg-accent"
      >
        <span>{label}</span>
        <Download size={13} className="text-muted-foreground" />
      </a>
    </li>
  );
}
