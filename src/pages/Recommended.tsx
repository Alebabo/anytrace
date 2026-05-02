import { Sparkles } from "lucide-react";

export default function Recommended() {
  return (
    <div className="px-4 md:px-8 py-10 max-w-3xl mx-auto">
      <div className="mb-10">
        <h2 className="font-serif text-5xl leading-[1.05]">Recommended</h2>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-xl">
          Personalised founder recommendations based on your watchlist, signals, and convergence patterns.
        </p>
      </div>

      <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
        <div className="mx-auto h-12 w-12 rounded-full bg-secondary grid place-items-center mb-4">
          <Sparkles className="h-5 w-5 text-foreground" strokeWidth={1.6} />
        </div>
        <h3 className="font-serif text-2xl mb-2">Coming soon</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          We're training the recommender on your activity and the live signals feed. It'll surface
          founders worth tracking before they hit anyone else's radar.
        </p>
      </div>
    </div>
  );
}
