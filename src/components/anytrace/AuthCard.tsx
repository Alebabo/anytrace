import { Layers3, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLoginAsAle, useMagicLinkSignIn } from "@/hooks/useAnytrace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AuthCard() {
  const [email, setEmail] = useState("");
  const magicLink = useMagicLinkSignIn();
  const testLogin = useLoginAsAle();
  const feedbackError =
    ((magicLink.error || testLogin.error) as Error | null)?.message || null;
  const isSuccess = magicLink.isSuccess || testLogin.isSuccess;

  return (
    <div className="max-w-xl rounded-[28px] border border-border bg-card p-6 shadow-sm md:p-8">
      <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-indigo-soft text-foreground">
        <Sparkles className="h-5 w-5" />
      </div>
      <h2 className="font-serif text-3xl leading-tight">Anytrace workspace</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Local access is active. The app fetches live data from your local backend first and only falls back to seed data if that backend is temporarily unavailable.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          className="h-11 rounded-full"
        />
        <Button
          type="button"
          className="rounded-full"
          disabled={magicLink.isPending || !email.trim()}
          onClick={() => magicLink.mutate({ email })}
        >
          {magicLink.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            "Send Magic Link"
          )}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={magicLink.isPending || testLogin.isPending}
          onClick={() => {
            setEmail("ale.bonanno2006@gmail.com");
            testLogin.mutate();
          }}
        >
          {testLogin.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending test link...
            </>
          ) : (
            "Direct Test Login"
          )}
        </Button>
      </div>

      {isSuccess && (
        <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
          Local access is active.
        </div>
      )}

      {feedbackError && (
        <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {feedbackError || "Magic link could not be sent."}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-border bg-surface-sunken px-4 py-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 text-foreground">
          <Layers3 className="h-4 w-4" />
          Access
        </div>
        <p className="mt-2 leading-relaxed">
          Backend-first mode is enabled. Manual additions stay in browser storage on this device, and backend data is retried automatically until it is available.
        </p>
      </div>
    </div>
  );
}
