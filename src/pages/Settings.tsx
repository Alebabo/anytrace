import { CalendarClock, CreditCard, Mail, Shield } from "lucide-react";
import { ProductGate } from "@/components/anytrace/ProductGate";
import { AuthCard } from "@/components/anytrace/AuthCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAccessState, useSignOut } from "@/hooks/useAnytrace";

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span>{label}</span>
      </div>
      <span className="text-sm text-muted-foreground">{value}</span>
    </div>
  );
}

export default function SettingsPage() {
  const { session, access, subscription, demoMode } = useAccessState();
  const signOut = useSignOut();

  if (!access.isAuthenticated) {
    return (
      <div className="px-4 md:px-8 py-10 max-w-5xl mx-auto">
        <div className="mb-10">
          <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
            Sign in with magic link to activate your trial, unlock the product, and prepare for Stripe billing.
          </p>
        </div>
        <AuthCard />
      </div>
    );
  }

  return (
    <ProductGate>
      <div className="px-4 md:px-8 py-10 max-w-4xl mx-auto">
        <div className="mb-10">
          <h2 className="font-serif text-5xl leading-[1.05]">Settings</h2>
          <p className="text-sm text-muted-foreground mt-3 max-w-2xl leading-relaxed">
            Auth, trial state, and billing readiness live here now. Product tuning can come back after Stripe is wired in.
          </p>
        </div>

        <div className="grid gap-4">
          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <h3 className="text-base font-medium mb-4">Account</h3>
            <InfoRow icon={Mail} label="Email" value={session?.user.email ?? "Unknown"} />
            <InfoRow icon={Shield} label="Access state" value={access.status} />
            <InfoRow icon={Shield} label="Mode" value={demoMode ? "Demo" : "Authenticated"} />
            <InfoRow
              icon={CalendarClock}
              label="Trial ends"
              value={subscription?.trial_ends_at ? new Date(subscription.trial_ends_at).toLocaleDateString() : "Not set"}
            />
            <div className="pt-5 flex justify-end">
              <Button
                variant="outline"
                className="rounded-full"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
              >
                {demoMode ? "Exit demo mode" : "Sign out"}
              </Button>
            </div>
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <h3 className="text-base font-medium mb-4">Billing readiness</h3>
            <div className="rounded-2xl bg-surface-sunken px-4 py-4">
              <div className="flex items-center gap-3 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                Stripe checkout is not live yet.
              </div>
              <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
                The subscription model is already in Supabase and the UI gates access after trial expiry. The next step is connecting Stripe customer creation, checkout, and webhook-driven status sync.
              </p>
            </div>
          </Card>

          <Card className="rounded-[28px] border-border p-6 shadow-none">
            <h3 className="text-base font-medium mb-4">Tracking scope</h3>
            <div className="grid gap-3 text-sm text-muted-foreground">
              <p>X and GitHub are active in the new model.</p>
              <p>LinkedIn is represented in the schema and profile links, but full ingestion is intentionally deferred.</p>
              <p>The graph and weekly ranking both read from the same Supabase event store now.</p>
            </div>
          </Card>
        </div>
      </div>
    </ProductGate>
  );
}
