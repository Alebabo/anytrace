import { useState } from "react";
import { ArrowRight, Loader2, Mail, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useEnableDemoMode, useMagicLinkSignIn } from "@/hooks/useAnytrace";
import { toast } from "sonner";

export function AuthCard() {
  const [email, setEmail] = useState("");
  const signIn = useMagicLinkSignIn();
  const enableDemo = useEnableDemoMode();

  const handleSubmit = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      toast.error("Enter your work email first.");
      return;
    }

    try {
      await signIn.mutateAsync(trimmed);
      toast.success("Magic link sent. Check your inbox to open Anytrace.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send magic link.");
    }
  };

  const handleDemoMode = async () => {
    try {
      await enableDemo.mutateAsync();
      toast.success("Demo mode enabled. Magic link bypassed for now.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not enable demo mode.");
    }
  };

  return (
    <div className="rounded-[28px] border border-border bg-card shadow-sm p-6 md:p-8 max-w-xl">
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-indigo-soft text-foreground mb-5">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="font-serif text-3xl leading-tight">Anytrace for venture teams</h2>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
        Track emerging people across X and GitHub, surface weekly top picks, and keep the graph focused on who is quietly collecting investor attention.
      </p>

      <div className="grid gap-3 mt-6">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="partner@fund.com"
            className="h-11 pl-10 rounded-full"
          />
        </div>
        <Button onClick={handleSubmit} disabled={signIn.isPending} className="h-11 rounded-full">
          {signIn.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Sending magic link
            </>
          ) : (
            "Sign in with magic link"
          )}
        </Button>
        <Button variant="outline" onClick={handleDemoMode} disabled={enableDemo.isPending} className="h-11 rounded-full">
          {enableDemo.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Opening demo
            </>
          ) : (
            <>
              Continue in demo mode <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
        <Shield className="h-3.5 w-3.5" />
        Trial access is created automatically on first login. Demo mode uses local seeded data and bypasses Supabase auth.
      </div>
    </div>
  );
}
