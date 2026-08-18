import { SentimentIntensityAnalyzer } from "vader-sentiment";
import type { Post, ScoredPost, Tone, VibeReport } from "./types";

/**
 * VADER's own recommended cutoffs for turning a compound score into a label.
 * Anything inside the band is noise rather than a real signal, so it reads neutral.
 */
const POSITIVE_AT = 0.05;
const NEGATIVE_AT = -0.05;

function toneOf(compound: number): Tone {
  if (compound >= POSITIVE_AT) return "positive";
  if (compound <= NEGATIVE_AT) return "negative";
  return "neutral";
}

export function scorePost(post: Post): ScoredPost {
  const { compound, pos, neu, neg } = SentimentIntensityAnalyzer.polarity_scores(
    post.title,
  );

  return {
    ...post,
    compound,
    parts: { pos, neu, neg },
    tone: toneOf(compound),
  };
}

/**
 * Turn a mean compound score into something a person can read at a glance.
 * The bands are deliberately wider than the per-post ones: averaging 50 titles
 * pulls hard toward zero, so a mean of 0.3 already means a distinctly cheerful feed.
 */
function verdictFor(mean: number): string {
  if (mean >= 0.35) return "Genuinely upbeat";
  if (mean >= 0.15) return "Leaning positive";
  if (mean > -0.05) return "Mostly neutral";
  if (mean > -0.25) return "Leaning negative";
  return "Pretty bleak";
}

/**
 * Percentages that add up to exactly 100.
 *
 * Rounding each bucket independently can land on 99 or 101, which looks broken
 * next to a total of 50 posts. Largest-remainder gives the same rounding but
 * hands the leftover points to whichever buckets were cut hardest.
 */
function distribute(counts: number[], total: number): number[] {
  if (total === 0) return counts.map(() => 0);

  const exact = counts.map((count) => (count / total) * 100);
  const floors = exact.map(Math.floor);
  let remaining = 100 - floors.reduce((sum, value) => sum + value, 0);

  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - floors[index] }))
    .sort((a, b) => b.remainder - a.remainder);

  const result = [...floors];
  for (const { index } of byRemainder) {
    if (remaining <= 0) break;
    result[index] += 1;
    remaining -= 1;
  }

  return result;
}

export function buildReport(subreddit: string, posts: Post[]): VibeReport {
  const scored = posts.map(scorePost);

  const counts = {
    positive: scored.filter((post) => post.tone === "positive").length,
    neutral: scored.filter((post) => post.tone === "neutral").length,
    negative: scored.filter((post) => post.tone === "negative").length,
  };

  const [positive, neutral, negative] = distribute(
    [counts.positive, counts.neutral, counts.negative],
    scored.length,
  );

  const meanCompound =
    scored.reduce((sum, post) => sum + post.compound, 0) / scored.length;

  // Sorting a copy — the main list stays in Reddit's hot order, which is the
  // order the user expects to scroll.
  const byScore = [...scored].sort((a, b) => a.compound - b.compound);
  const lowest = byScore[0];
  const highest = byScore[byScore.length - 1];

  return {
    subreddit,
    postCount: scored.length,
    meanCompound,
    counts,
    percentages: { positive, neutral, negative },
    verdict: verdictFor(meanCompound),
    mostPositive: highest && highest.compound > 0 ? highest : null,
    mostNegative: lowest && lowest.compound < 0 ? lowest : null,
    posts: scored,
  };
}
