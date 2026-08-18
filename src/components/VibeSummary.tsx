import type { ScoredPost, VibeReport } from "@/lib/types";

function signed(value: number, places = 2): string {
  const rounded = value.toFixed(places);
  return value > 0 ? `+${rounded}` : rounded;
}

function toneColor(compound: number): string {
  if (compound >= 0.05) return "var(--tone-positive)";
  if (compound <= -0.05) return "var(--tone-negative)";
  return "var(--tone-neutral)";
}

/**
 * Where the mean sits on VADER's -1..+1 scale, as a diverging bar off a centre
 * baseline. The hero number is the value; this is the context that stops "+0.18"
 * from being a number without a sense of scale.
 */
function MeanGauge({ value }: { value: number }) {
  const clamped = Math.max(-1, Math.min(1, value));
  const half = Math.abs(clamped) * 50;
  const growsRight = clamped >= 0;

  return (
    <div className="mt-5">
      <div className="relative h-5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-rule" aria-hidden="true" />
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2"
          style={{
            left: growsRight ? "50%" : `${50 - half}%`,
            width: `${Math.max(half, 0.4)}%`,
            background: toneColor(value),
            borderTopLeftRadius: growsRight ? 0 : 4,
            borderBottomLeftRadius: growsRight ? 0 : 4,
            borderTopRightRadius: growsRight ? 4 : 0,
            borderBottomRightRadius: growsRight ? 4 : 0,
          }}
          aria-hidden="true"
        />
        <div className="absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-axis" aria-hidden="true" />
      </div>
      <div className="mt-1 flex justify-between text-[11px] tabular-nums text-ink-muted" aria-hidden="true">
        <span>−1.0</span>
        <span>0</span>
        <span>+1.0</span>
      </div>
    </div>
  );
}

function ExtremeCard({ label, post }: { label: string; post: ScoredPost | null }) {
  if (!post) {
    return (
      <div className="panel flex flex-col p-5">
        <p className="text-xs font-semibold text-ink-secondary">{label}</p>
        <p className="mt-2 text-sm text-ink-muted">
          Nothing in this listing scored that way.
        </p>
      </div>
    );
  }

  return (
    <div className="panel flex flex-col p-5">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: toneColor(post.compound) }}
          aria-hidden="true"
        />
        <p className="text-xs font-semibold text-ink-secondary">{label}</p>
        <span className="ml-auto text-xs font-semibold tabular-nums text-ink">
          {signed(post.compound)}
        </span>
      </div>
      <a
        href={post.permalink}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 text-sm leading-snug text-ink underline-offset-4 hover:underline"
      >
        {post.title}
      </a>
      <p className="mt-2 text-xs text-ink-muted">u/{post.author}</p>
    </div>
  );
}

export default function VibeSummary({ report }: { report: VibeReport }) {
  const leaning =
    report.counts.positive === report.counts.negative
      ? "an even split"
      : report.counts.positive > report.counts.negative
        ? `${report.counts.positive} positive to ${report.counts.negative} negative`
        : `${report.counts.negative} negative to ${report.counts.positive} positive`;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="panel p-5 sm:p-6" aria-labelledby="verdict-heading">
        <h2 id="verdict-heading" className="text-sm font-semibold text-ink">
          Overall vibe
        </h2>
        <p className="mt-1 text-xs text-ink-muted">
          Mean compound score across {report.postCount} titles
        </p>

        {/*
          Hero figure: primary ink, proportional figures, same sans as everything
          else. The colour lives on the dot beside the verdict and on the gauge —
          a 56px number in a mid-chroma hue is a contrast problem for no gain.
        */}
        <p className="mt-4 text-[56px] font-semibold leading-none tracking-tight text-ink">
          {signed(report.meanCompound)}
        </p>
        <p className="mt-3 flex items-center gap-2 text-base font-medium text-ink">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: toneColor(report.meanCompound) }}
            aria-hidden="true"
          />
          {report.verdict}
        </p>
        <p className="mt-1 text-sm text-ink-secondary">r/{report.subreddit} is running {leaning}.</p>

        <MeanGauge value={report.meanCompound} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <ExtremeCard label="Most positive title" post={report.mostPositive} />
        <ExtremeCard label="Most negative title" post={report.mostNegative} />
      </div>
    </div>
  );
}
