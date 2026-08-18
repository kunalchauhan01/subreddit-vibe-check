/** Sentiment bucket a single post falls into. */
export type Tone = "positive" | "neutral" | "negative";

/** A Reddit post, trimmed down to the fields the dashboard actually renders. */
export interface Post {
  id: string;
  title: string;
  author: string;
  score: number;
  comments: number;
  permalink: string;
  createdUtc: number;
  flair: string | null;
  nsfw: boolean;
}

/** A post plus the VADER scores computed from its title. */
export interface ScoredPost extends Post {
  /** VADER's normalized -1..1 score. The one number worth reasoning about. */
  compound: number;
  /** Proportions of the title that read positive / neutral / negative. Sums to 1. */
  parts: { pos: number; neu: number; neg: number };
  tone: Tone;
}

export interface ToneBreakdown {
  positive: number;
  neutral: number;
  negative: number;
}

export interface VibeReport {
  subreddit: string;
  postCount: number;
  /** Mean compound across every scored title. */
  meanCompound: number;
  /** Post counts per bucket. */
  counts: ToneBreakdown;
  /** Same buckets as percentages of postCount, rounded to whole numbers. */
  percentages: ToneBreakdown;
  /** Human-facing label derived from meanCompound. */
  verdict: string;
  mostPositive: ScoredPost | null;
  mostNegative: ScoredPost | null;
  posts: ScoredPost[];
}

export interface ApiError {
  error: string;
  /** Present when we want the UI to say something more specific than the status text. */
  hint?: string;
}
