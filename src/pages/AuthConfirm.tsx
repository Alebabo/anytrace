import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const allowedTypes: EmailOtpType[] = ["signup", "invite", "magiclink", "recovery", "email", "email_change"];

export default function AuthConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Confirming your magic link...");

  useEffect(() => {
    let active = true;

    async function confirm() {
      const tokenHash = searchParams.get("token_hash");
      const rawType = searchParams.get("type");

      if (!tokenHash || !rawType || !allowedTypes.includes(rawType as EmailOtpType)) {
        if (!active) return;
        setMessage("This magic link is incomplete or invalid.");
        window.setTimeout(() => navigate("/settings", { replace: true }), 1800);
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: rawType as EmailOtpType,
      });

      if (!active) return;

      if (error) {
        setMessage("This magic link could not be verified. Please request a new one.");
        window.setTimeout(() => navigate("/settings", { replace: true }), 2200);
        return;
      }

      setMessage("Magic link confirmed. Redirecting to Anytrace...");
      window.setTimeout(() => navigate("/", { replace: true }), 900);
    }

    void confirm();

    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  return (
    <div className="min-h-screen grid place-items-center bg-surface-sunken/40 px-4">
      <div className="w-full max-w-md rounded-[28px] border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
        <h1 className="mt-5 font-serif text-3xl leading-tight">Anytrace</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
