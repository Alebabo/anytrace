import { ArrowRight, Eye, Network, Radar, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const proofStats = [
  { value: "1.2k+", label: "profiles mapped across founder, operator and VC circles" },
  { value: "31", label: "tracked VCs in the active watchlist shown by the product" },
  { value: "Live", label: "graph sync, people overview and follow signals in one loop" },
];

const featureCards = [
  {
    eyebrow: "Signal dossier",
    title: "Turn a single profile into a readable conviction case.",
    body:
      "Profile-level scoring, confidence, timing windows and watcher context make each lead understandable before anyone opens the graph.",
    image: "/landing/dossier.png",
    alt: "Anytrace dossier view with score, confidence and watcher details.",
  },
  {
    eyebrow: "Connection map",
    title: "Explain why a person matters with first-degree context.",
    body:
      "The focused connection view centers the tracked account and shows which funds or operators sit directly around it.",
    image: "/landing/connection-details.png",
    alt: "Anytrace connection details screen with centered connection map.",
  },
  {
    eyebrow: "Watchlist",
    title: "Move from discovery to action without leaving the workflow.",
    body:
      "Saved VCs, who-to-follow suggestions and outbound shortcuts keep sourcing, qualification and follow-up tightly connected.",
    image: "/landing/watchlist.png",
    alt: "Anytrace watchlist view with who-to-follow cards and selected VCs.",
  },
];

const screenshotGallery = [
  {
    title: "Full overview",
    image: "/landing/full-overview.png",
    alt: "Anytrace graph interface with people overview sidebar and network map.",
  },
  {
    title: "Dossier",
    image: "/landing/dossier.png",
    alt: "Anytrace dossier view with score, confidence and watcher details.",
  },
  {
    title: "Connection details",
    image: "/landing/connection-details.png",
    alt: "Anytrace connection details screen with centered connection map.",
  },
  {
    title: "Multi-follows",
    image: "/landing/multi-follows.png",
    alt: "Anytrace multi-follow graph cluster view.",
  },
  {
    title: "Large graph",
    image: "/landing/large-graph.png",
    alt: "Anytrace large graph overview with dense network structure.",
  },
  {
    title: "Watchlist",
    image: "/landing/watchlist.png",
    alt: "Anytrace watchlist view with who-to-follow cards and selected VCs.",
  },
];

export default function MainDashboard() {
  return (
    <div className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(7,51,45,0.08),_transparent_30%),radial-gradient(circle_at_80%_10%,_rgba(244,196,48,0.22),_transparent_24%),linear-gradient(180deg,_#fcfbf6_0%,_#f6f2e8_100%)]">
      <div className="pointer-events-none absolute inset-0 hero-grid opacity-50" />
      <div className="pointer-events-none absolute left-[-8rem] top-28 h-72 w-72 rounded-full bg-[rgba(7,51,45,0.08)] blur-3xl float-slow" />
      <div className="pointer-events-none absolute right-[-5rem] top-32 h-64 w-64 rounded-full bg-[rgba(244,196,48,0.16)] blur-3xl float-slower" />

      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-10 md:px-8 md:pb-24 md:pt-14">
        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)] lg:gap-12">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--border-strong))] bg-white/85 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))] backdrop-blur">
              <Radar className="h-3.5 w-3.5 text-[hsl(var(--primary))]" />
              Relationship intelligence for venture teams
            </div>

            <h2 className="mt-6 max-w-4xl font-display text-5xl leading-[0.94] text-[hsl(var(--foreground))] text-balance md:text-7xl">
              See the people graph before the market notices.
            </h2>

            <p className="mt-6 max-w-2xl text-base leading-7 text-[hsl(var(--muted-foreground))] md:text-lg">
              Anytrace turns noisy X and GitHub movement into a live network surface for sourcing, diligence and early
              relationship building. The product makes hidden overlap visible, scores emerging profiles and keeps your
              venture watchlist operational.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-6 text-sm">
                <Link to="/graph">
                  Open live graph <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 rounded-full border-[hsl(var(--border-strong))] bg-white/80 px-6 text-sm backdrop-blur"
              >
                <Link to="/watchlist">View watchlist</Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {proofStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[26px] border border-white/70 bg-white/70 px-4 py-5 shadow-[0_18px_50px_-28px_rgba(15,45,40,0.35)] backdrop-blur"
                >
                  <div className="text-2xl font-semibold tracking-[-0.04em] text-[hsl(var(--foreground))]">{stat.value}</div>
                  <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative lg:pt-2">
            <div className="absolute -left-10 top-8 hidden h-32 w-32 rounded-full border border-white/60 bg-white/35 blur-2xl lg:block" />
            <div className="relative rounded-[34px] border border-white/70 bg-white/70 p-3 shadow-[0_30px_80px_-36px_rgba(15,45,40,0.45)] backdrop-blur">
              <img
                src="/landing/full-overview.png"
                alt="Anytrace graph interface with people overview sidebar and network map."
                className="h-auto w-full rounded-[26px] border border-black/5 object-cover"
              />
            </div>

            <div className="float-slow absolute -bottom-6 left-0 hidden max-w-[260px] rounded-[28px] border border-white/75 bg-[#fffdf8]/90 p-3 shadow-[0_24px_60px_-30px_rgba(15,45,40,0.4)] backdrop-blur md:block">
              <img
                src="/landing/dossier.png"
                alt="Anytrace dossier card preview."
                className="rounded-[20px] border border-black/5"
              />
            </div>

            <div className="float-slower absolute -right-5 top-10 hidden max-w-[220px] rounded-[28px] border border-white/75 bg-[#fffdf8]/90 p-3 shadow-[0_24px_60px_-30px_rgba(15,45,40,0.4)] backdrop-blur xl:block">
              <img
                src="/landing/watchlist.png"
                alt="Anytrace watchlist card preview."
                className="rounded-[20px] border border-black/5"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        <div className="mb-6 max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">
            Screenshots
          </div>
          <h3 className="mt-3 font-display text-3xl leading-tight tracking-[-0.04em] md:text-4xl">
            Alle sechs Produktansichten direkt auf der Landing Page.
          </h3>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {screenshotGallery.map((shot) => (
            <figure
              key={shot.title}
              className="overflow-hidden rounded-[30px] border border-white/70 bg-white/82 p-3 shadow-[0_24px_70px_-34px_rgba(15,45,40,0.38)] backdrop-blur"
            >
              <img src={shot.image} alt={shot.alt} className="w-full rounded-[22px] border border-black/5" />
              <figcaption className="px-2 pb-1 pt-4 text-sm font-medium text-[hsl(var(--foreground))]">
                {shot.title}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 pb-8 md:px-8 md:pb-12">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-36px_rgba(15,45,40,0.35)] backdrop-blur">
            <Eye className="h-5 w-5 text-[hsl(var(--primary))]" />
            <h3 className="mt-5 text-xl font-medium tracking-[-0.03em]">From noise to narrative</h3>
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Analyst-friendly profile pages package score, confidence and watcher evidence into one clean read.
            </p>
          </div>
          <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-36px_rgba(15,45,40,0.35)] backdrop-blur">
            <Network className="h-5 w-5 text-[hsl(var(--primary))]" />
            <h3 className="mt-5 text-xl font-medium tracking-[-0.03em]">Graph-first exploration</h3>
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Dense relationship maps make overlapping follows, multi-follow clusters and central connectors obvious.
            </p>
          </div>
          <div className="rounded-[30px] border border-white/70 bg-white/80 p-6 shadow-[0_20px_60px_-36px_rgba(15,45,40,0.35)] backdrop-blur">
            <Users className="h-5 w-5 text-[hsl(var(--primary))]" />
            <h3 className="mt-5 text-xl font-medium tracking-[-0.03em]">Operational watchlists</h3>
            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              Recommended profiles, tracked funds and outbound links keep the product useful after the insight moment.
            </p>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-14">
        <div className="mb-8 max-w-2xl">
          <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">
            Product walkthrough
          </div>
          <h3 className="mt-3 font-display text-3xl leading-tight tracking-[-0.04em] md:text-5xl">
            Every screen is built around an analyst question.
          </h3>
        </div>

        <div className="space-y-5">
          {featureCards.map((card, index) => (
            <article
              key={card.title}
              className={`grid gap-6 rounded-[34px] border border-white/70 bg-white/78 p-4 shadow-[0_24px_70px_-34px_rgba(15,45,40,0.38)] backdrop-blur md:p-6 ${
                index % 2 === 0 ? "lg:grid-cols-[0.9fr_1.1fr]" : "lg:grid-cols-[1.1fr_0.9fr]"
              }`}
            >
              <div className={`${index % 2 === 1 ? "lg:order-2" : ""} flex flex-col justify-center px-2 py-2 md:px-4`}>
                <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">
                  {card.eyebrow}
                </div>
                <h4 className="mt-3 text-2xl font-medium leading-tight tracking-[-0.04em] md:text-[2rem]">
                  {card.title}
                </h4>
                <p className="mt-4 max-w-xl text-sm leading-7 text-[hsl(var(--muted-foreground))] md:text-base">
                  {card.body}
                </p>
              </div>

              <div className={`${index % 2 === 1 ? "lg:order-1" : ""} rounded-[28px] border border-black/5 bg-[#fcfbf7] p-3`}>
                <img src={card.image} alt={card.alt} className="h-auto w-full rounded-[20px] border border-black/5" />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-14">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[36px] border border-[rgba(15,45,40,0.08)] bg-[linear-gradient(135deg,_rgba(8,36,33,0.96),_rgba(17,71,64,0.94))] p-4 text-white shadow-[0_30px_80px_-36px_rgba(15,45,40,0.7)] md:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.24em] text-white/65">Graph intelligence</div>
                <h4 className="mt-3 max-w-lg text-3xl font-medium leading-tight tracking-[-0.04em] md:text-4xl">
                  Read the full network at macro and micro scale.
                </h4>
              </div>
              <div className="hidden rounded-full border border-white/15 px-4 py-2 text-xs text-white/75 md:block">
                Multi-follow clusters
              </div>
            </div>

            <div className="mt-6 rounded-[28px] border border-white/10 bg-white/5 p-3">
              <img
                src="/landing/multi-follows.png"
                alt="Anytrace multi-follow graph cluster view."
                className="w-full rounded-[20px] border border-white/10"
              />
            </div>
          </div>

          <div className="rounded-[36px] border border-white/70 bg-white/80 p-4 shadow-[0_24px_70px_-34px_rgba(15,45,40,0.38)] backdrop-blur md:p-6">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">Full overview</div>
            <h4 className="mt-3 text-3xl font-medium leading-tight tracking-[-0.04em]">
              Zoom out and understand system-wide density.
            </h4>
            <p className="mt-4 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
              The large-map mode helps teams judge how tightly a profile sits inside the broader graph and where the
              strongest neighborhoods emerge.
            </p>

            <div className="mt-6 rounded-[28px] border border-black/5 bg-[#fcfbf7] p-3">
              <img
                src="/landing/large-graph.png"
                alt="Anytrace large graph overview with dense network structure."
                className="w-full rounded-[20px] border border-black/5"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 pb-20 pt-8 md:px-8 md:pb-24 md:pt-14">
        <div className="rounded-[40px] border border-[rgba(15,45,40,0.08)] bg-[linear-gradient(180deg,_rgba(255,253,247,0.92),_rgba(248,243,230,0.95))] p-8 shadow-[0_28px_80px_-36px_rgba(15,45,40,0.38)] md:p-12">
          <div className="max-w-3xl">
            <div className="text-[11px] uppercase tracking-[0.24em] text-[hsl(var(--muted-foreground))]">Built for focused teams</div>
            <h3 className="mt-3 font-display text-3xl leading-tight tracking-[-0.04em] md:text-5xl">
              A landing page that shows the product with conviction, not placeholder copy.
            </h3>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[hsl(var(--muted-foreground))] md:text-base">
              The screenshots now do the heavy lifting: graph density, dossier confidence, connection context and
              watchlist action are all visible immediately.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 rounded-full px-6 text-sm">
              <Link to="/graph">
                Explore the graph <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-12 rounded-full border-[hsl(var(--border-strong))] bg-white/75 px-6 text-sm"
            >
              <Link to="/watchlist">Review tracked watchlists</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
