import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Logo } from "@/components/ide/Logo";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PeakGravity IDE" },
      { name: "description", content: "Sign in to PeakGravity to sync your AI provider keys securely." },
      { property: "og:title", content: "Sign in — PeakGravity IDE" },
      { property: "og:description", content: "Sign in to PeakGravity to sync your AI provider keys securely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setNotice("Account created. Check your inbox to confirm your email, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-editor text-foreground">
      <div className="drag-region flex h-[38px] items-center justify-center bg-chrome text-[13px] text-chrome-foreground">
        PeakGravity IDE
      </div>
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex flex-col items-center">
            <Logo size={56} className="text-foreground" />
            <h1 className="mt-4 text-[22px] font-light tracking-wide">
              {mode === "signin" ? "Sign in to PeakGravity" : "Create your account"}
            </h1>
            <p className="mt-1 text-center text-muted-foreground">
              Your AI provider keys are encrypted and synced to every device you sign in on.
            </p>
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 rounded-[3px] border border-input bg-chrome px-3 text-[13px] text-foreground focus:border-ring focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-muted-foreground">
              Password
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-9 rounded-[3px] border border-input bg-chrome px-3 text-[13px] text-foreground focus:border-ring focus:outline-none"
              />
            </label>
            {error && <p className="text-[12px] text-destructive">{error}</p>}
            {notice && <p className="text-[12px] text-success">{notice}</p>}
            <button
              type="submit"
              disabled={busy}
              className="mt-2 h-10 rounded-[3px] bg-primary text-[14px] text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError(null);
            }}
            className="mt-5 w-full text-center text-[13px] text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "New here? Create an account" : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
