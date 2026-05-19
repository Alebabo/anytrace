import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import type { SeedFollowAlert, SeedFollowPromotionDraft, VcAccountType, VcTier } from "@/data/traqr";
import { usePromoteSeedFollowAlert } from "@/hooks/useTraqr";
import { buildSeedPromotionDraft } from "@/lib/seedFollowAlerts";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  alert: SeedFollowAlert | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const ACCOUNT_TYPES: VcAccountType[] = ["partner", "firm", "analyst", "scout", "brand", "journalist", "other"];
const TIERS: VcTier[] = ["microvc", "vc", "angel", "journalist"];

const EMPTY_DRAFT: SeedFollowPromotionDraft = {
  alertId: "",
  name: "",
  xHandle: "",
  linkedinUrl: "",
  clusterName: "",
  accountType: "partner",
  tier: "microvc",
};

function cleanDraft(draft: SeedFollowPromotionDraft): SeedFollowPromotionDraft {
  return {
    ...draft,
    name: draft.name.trim(),
    xHandle: draft.xHandle.trim().replace(/^@/, ""),
    linkedinUrl: draft.linkedinUrl.trim(),
    clusterName: draft.clusterName.trim(),
  };
}

export function SeedPromotionDialog({ alert, open, onOpenChange }: Props) {
  const promoteAlert = usePromoteSeedFollowAlert();
  const resetPromotion = promoteAlert.reset;
  const [draft, setDraft] = useState<SeedFollowPromotionDraft>(EMPTY_DRAFT);

  useEffect(() => {
    if (open && alert) {
      setDraft(buildSeedPromotionDraft(alert));
      resetPromotion();
    }
  }, [alert, open, resetPromotion]);

  const cleanedDraft = cleanDraft(draft);
  const canSubmit = Boolean(cleanedDraft.alertId && cleanedDraft.name && cleanedDraft.xHandle);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) resetPromotion();
        onOpenChange(value);
      }}
    >
      <DialogContent className="max-w-[min(560px,94vw)] rounded-2xl border-border">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            promoteAlert.mutate(cleanedDraft, {
              onSuccess: () => onOpenChange(false),
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Add to seed list</DialogTitle>
            <DialogDescription>
              This account will be used in future seed scans and removed from active alert views.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="seed-promotion-name">Name</Label>
              <Input
                id="seed-promotion-name"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Investor name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="seed-promotion-x-handle">X handle</Label>
              <Input
                id="seed-promotion-x-handle"
                value={draft.xHandle}
                onChange={(event) => setDraft((current) => ({ ...current, xHandle: event.target.value }))}
                placeholder="handle"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="seed-promotion-linkedin">LinkedIn URL</Label>
              <Input
                id="seed-promotion-linkedin"
                value={draft.linkedinUrl}
                onChange={(event) => setDraft((current) => ({ ...current, linkedinUrl: event.target.value }))}
                placeholder="https://www.linkedin.com/in/..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2 sm:col-span-1">
                <Label htmlFor="seed-promotion-cluster">Outlet / firm</Label>
                <Input
                  id="seed-promotion-cluster"
                  value={draft.clusterName}
                  onChange={(event) => setDraft((current) => ({ ...current, clusterName: event.target.value }))}
                  placeholder="Outlet or firm"
                />
              </div>

              <div className="grid gap-2">
                <Label>Type</Label>
                <Select
                  value={draft.accountType}
                  onValueChange={(value) =>
                    setDraft((current) => ({ ...current, accountType: value as VcAccountType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Tier</Label>
                <Select
                  value={draft.tier}
                  onValueChange={(value) => setDraft((current) => ({ ...current, tier: value as VcTier }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        {tier}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {promoteAlert.isError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {(promoteAlert.error as Error)?.message || "Seed account could not be added."}
              </div>
            ) : null}
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || promoteAlert.isPending}>
              {promoteAlert.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Add to seed list
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
