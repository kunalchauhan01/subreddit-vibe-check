"use client";

import { useState } from "react";
import type { Tone, VibeReport } from "@/lib/types";

/**
 * Diverging stacked bar, centred on neutral.
 *
 * Sentiment is an ordered scale rather than a set of unrelated categories, so a
 * plain 100% stacked bar would throw away the thing you actually want to see:
 * which way the subreddit leans. Here the neutral block straddles the zero line,
 * negative grows left and positive grows right, and the asymmetry is the reading.
 *
 * Half a data-percent per track-percent, because the bar can sit anywhere from
 * fully-left to fully-right and still has to fit inside the track.
 */
const SCALE = 0.5;

const TONE_META: Record<Tone, { label: string; color: string }> = {
  negative: { label: "Negative", color: "var(--tone-negative)" },
  neutral: { label: "Neutral", color: "var(--tone-neutral)" },
  positive: { label: "Positive", color: "var(--tone-positive)" },
};

// Left to right along the scale.
const ORDER: Tone[] = ["negative", "neutral", "positive"];

interface Props {
  report: VibeReport;
}

export default function ToneDistribution({ report }: Props) {
  const [active, setActive] = useState<Tone | null>(null);

  const { percentages, counts } = report;

  const segments = ORDER.map((tone) => ({
    tone,
    percent: percentages[tone],
    count: counts[tone],
  })).filter((segment) => segment.percent > 0);

  // Slide the bar so the midpoint of the neutral block lands on zero.
  const offset = 50 - SCALE * (percentages.negative + percentages.neutral / 2);

  return (
    <section className="panel p-5 sm:p-6" aria-labelledby="distribution-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="distribution-heading" className="text-sm font-semibold text-ink">
          Tone distribution
        </h2>
        <p className="text-xs text-ink-muted">
          {report.postCount} hot posts, split by title sentiment
        </p>
      </div>

      <div className="mt-7">
        {/* Zero tick, sitting above the bar so it never draws ink across the data. */}
        <div className="relative h-1.5">
          <div
            className="absolute top-0 h-1.5 w-px bg-axis"
            style={{ left: "50%" }}
            aria-hidden="true"
          />
        </div>

        <div className="relative h-7">
          <div
            className="absolute inset-y-0 flex"
            style={{ left: `${offset}%`, width: `${100 * SCALE}%` }}
          >
            {segments.map((segment, index) => {
              const meta = TONE_META[segment.tone];
              const isFirst = index === 0;
              const isLast = index === segments.length - 1;

              return (
                <button
                  key={segment.tone}
                  type="button"
                  // The button is 28px tall while the fill is 20px — the extra
                  // height is hit target, so nobody has to aim at a thin bar.
                  className="group relative flex h-7 items-center focus:outline-none"
                  // Percent of the bar, not of the track — the wrapper already
                  // carries the SCALE factor, so applying it again here would
                  // render the whole thing at half width.
                  style={{
                    width: `${segment.percent}%`,
                    marginRight: isLast ? 0 : 2,
                  }}
                  onPointerEnter={() => setActive(segment.tone)}
                  onPointerLeave={() => setActive(null)}
                  onFocus={() => setActive(segment.tone)}
                  onBlur={() => setActive(null)}
                  aria-label={`${meta.label}: ${segment.count} posts, ${segment.percent} percent`}
                >
                  <span
                    className="h-5 w-full transition-opacity group-hover:opacity-85 group-focus-visible:opacity-85"
                    style={{
                      background: meta.color,
                      borderTopLeftRadius: isFirst ? 4 : 0,
                      borderBottomLeftRadius: isFirst ? 4 : 0,
                      borderTopRightRadius: isLast ? 4 : 0,
                      borderBottomRightRadius: isLast ? 4 : 0,
                    }}
                  />

                  {active === segment.tone && (
                    <span
                      role="status"
                      className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs shadow-sm"
                      style={{
                        background: "var(--surface)",
                        border: "1px solid var(--hairline)",
                      }}
                    >
                      <span className="font-semibold text-ink">
                        {segment.count} {segment.count === 1 ? "post" : "posts"}
                      </span>
                      <span className="text-ink-secondary"> · {meta.label}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Axis. Both arms run 0 to 100% of posts, outward from the centre. */}
        <div className="relative mt-2 h-px bg-rule" aria-hidden="true" />
        <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-ink-muted" aria-hidden="true">
          {[
            { at: 0, label: "100%" },
            { at: 25, label: "50%" },
            { at: 50, label: "0" },
            { at: 75, label: "50%" },
            { at: 100, label: "100%" },
          ].map((tick) => (
            <span
              key={tick.at}
              className="absolute"
              // The end ticks anchor to their edge instead of centring on it,
              // so neither one hangs off the side of the card.
              style={
                tick.at === 0
                  ? { left: 0 }
                  : tick.at === 100
                    ? { right: 0 }
                    : { left: `${tick.at}%`, transform: "translateX(-50%)" }
              }
            >
              {tick.label}
            </span>
          ))}
        </div>

        <div className="mt-1 flex justify-between text-[11px] text-ink-muted" aria-hidden="true">
          <span>← more negative</span>
          <span>more positive →</span>
        </div>
      </div>

      {/*
        The legend carries the numbers as well as the identity. That keeps every
        value readable without hovering, and avoids cramming labels into segments
        that may be only a few pixels wide.
      */}
      <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-hairline pt-4">
        {ORDER.map((tone) => (
          <li key={tone} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: TONE_META[tone].color }}
              aria-hidden="true"
            />
            <span className="text-ink-secondary">{TONE_META[tone].label}</span>
            <span className="font-semibold tabular-nums text-ink">
              {counts[tone]}
            </span>
            <span className="tabular-nums text-ink-muted">
              ({percentages[tone]}%)
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
