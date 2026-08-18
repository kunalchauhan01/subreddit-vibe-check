"use client";

import { useMemo, useState } from "react";
import type { ScoredPost } from "@/lib/types";

type SortKey = "hot" | "positive" | "negative";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "hot", label: "Hot order" },
  { key: "positive", label: "Most positive" },
  { key: "negative", label: "Most negative" },
];

function toneColor(compound: number): string {
  if (compound >= 0.05) return "var(--tone-positive)";
  if (compound <= -0.05) return "var(--tone-negative)";
  return "var(--tone-neutral)";
}

function compact(value: number): string {
  if (value < 1000) return String(value);
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
}

function ago(createdUtc: number): string {
  const hours = Math.floor((Date.now() / 1000 - createdUtc) / 3600);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function PostTable({ posts }: { posts: ScoredPost[] }) {
  const [sort, setSort] = useState<SortKey>("hot");

  const rows = useMemo(() => {
    if (sort === "hot") return posts;
    const copy = [...posts];
    // Reddit's own ordering is the default, so only the sentiment sorts copy.
    return sort === "positive"
      ? copy.sort((a, b) => b.compound - a.compound)
      : copy.sort((a, b) => a.compound - b.compound);
  }, [posts, sort]);

  return (
    <section className="panel overflow-hidden" aria-labelledby="posts-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline p-5 sm:px-6">
        <div>
          <h2 id="posts-heading" className="text-sm font-semibold text-ink">
            Every scored title
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            The full table, so no value is hover-only
          </p>
        </div>

        <div className="flex rounded-lg border border-hairline p-0.5" role="group" aria-label="Sort posts">
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSort(option.key)}
              aria-pressed={sort === option.key}
              className={`rounded-[6px] px-2.5 py-1.5 text-xs transition-colors ${
                sort === option.key
                  ? "bg-wash font-semibold text-ink"
                  : "text-ink-secondary hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline text-[11px] uppercase tracking-wide text-ink-muted">
              <th scope="col" className="py-2.5 pl-5 pr-3 font-medium sm:pl-6">
                Title
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Upvotes
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Comments
              </th>
              <th scope="col" className="py-2.5 pl-3 pr-5 text-right font-medium sm:pr-6">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((post) => (
              <tr
                key={post.id}
                className="border-b border-hairline last:border-0 hover:bg-wash"
              >
                <td className="py-3 pl-5 pr-3 sm:pl-6">
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: toneColor(post.compound) }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <a
                        href={post.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm leading-snug text-ink underline-offset-4 hover:underline"
                      >
                        {post.title}
                      </a>
                      <p className="mt-1 text-xs text-ink-muted">
                        u/{post.author} ·{" "}
                        {/* Server and browser clocks differ by a second or two,
                            which is enough to render "5h" against "6h" on a
                            boundary. The value is cosmetic, so let it settle. */}
                        <span suppressHydrationWarning>{ago(post.createdUtc)}</span>
                        {post.flair ? ` · ${post.flair}` : ""}
                        {post.nsfw ? " · NSFW" : ""}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-ink-secondary">
                  {compact(post.score)}
                </td>
                <td className="px-3 py-3 text-right text-sm tabular-nums text-ink-secondary">
                  {compact(post.comments)}
                </td>
                <td className="py-3 pl-3 pr-5 text-right text-sm font-medium tabular-nums text-ink sm:pr-6">
                  {post.compound > 0 ? `+${post.compound.toFixed(2)}` : post.compound.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
