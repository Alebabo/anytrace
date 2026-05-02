import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { AuthCard } from "@/components/anytrace/AuthCard";
import { Button } from "@/components/ui/button";
import { useAccessState } from "@/hooks/useAnytrace";

export function ProductGate({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
}) {
  const { access } = useAccessState();

  if (!access.isAuthenticated) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        {title && (
          <div className="mb-8">
            <h2 className="font-serif text-5xl leading-[1.05]">{title}</h2>
            {description && (
              <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
                {description}
              </p>
            )}
          </div>
        )}
        <AuthCard />
      </div>
    );
  }

  if (access.requiresPayment) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-6xl mx-auto">
        <div className="rounded-[28px] border border-border bg-card p-8 shadow-sm max-w-2xl">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-indigo-soft text-foreground mb-5">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="font-serif text-3xl leading-tight">Your trial has ended</h2>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Anytrace is ready for billing hookup next. The product data is locked until Stripe checkout is connected and your subscription is reactivated.
          </p>
          <div className="mt-6 flex items-center gap-3">
            <Button disabled className="rounded-full">
              Billing coming soon
            </Button>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Trial ended
            </span>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
