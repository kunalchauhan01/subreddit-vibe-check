import type { Post } from "./types";

/**
 * Shared between the browser and the server route: the error type, input
 * validation, and the listing parser. Nothing here performs a request to
 * Reddit — see `reddit-server.ts` for that, and `fetchHotPosts` below for the
 * browser's call to our own API.
 */

export class RedditError extends Error {
  status: number;
  hint?: string;

  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = "RedditError";
    this.status = status;
    this.hint = hint;
  }
}

/** Subreddit names are 3-21 chars, letters/digits/underscore. Reject early rather than round-trip. */
export function normalizeSubreddit(input: string): string {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?reddit\.com/i, "")
    .replace(/^\/?(r\/)?/i, "")
    .replace(/\/$/, "");

  if (!/^[A-Za-z0-9_]{3,21}$/.test(cleaned)) {
    throw new RedditError(
      `"${input}" isn't a valid subreddit name.`,
      400,
      "Names are 3-21 characters, letters, numbers and underscores only.",
    );
  }

  return cleaned;
}

/** Shape of the bits of Reddit's listing response we read. */
export interface RedditListing {
  data?: {
    children?: Array<{ kind: string; data: RedditPostData }>;
  };
}

interface RedditPostData {
  id: string;
  title: string;
  author: string;
  score: number;
  num_comments: number;
  permalink: string;
  created_utc: number;
  link_flair_text: string | null;
  over_18: boolean;
  stickied: boolean;
}

/**
 * Turn a raw listing into the posts the dashboard renders.
 *
 * Posts pinned by moderators are dropped: they're usually rules threads that sit
 * at the top for months and would skew the sentiment of every single run.
 */
export function parseListing(json: RedditListing): Post[] {
  const children = json.data?.children ?? [];

  return children
    .filter((child) => child.kind === "t3" && !child.data.stickied)
    .map(({ data }) => ({
      id: data.id,
      title: data.title,
      author: data.author,
      score: data.score,
      comments: data.num_comments,
      permalink: `https://www.reddit.com${data.permalink}`,
      createdUtc: data.created_utc,
      flair: data.link_flair_text ?? null,
      nsfw: data.over_18,
    }));
}

/**
 * The browser's entry point. It calls our own API route, not Reddit.
 *
 * Reddit does not send `Access-Control-Allow-Origin` for arbitrary origins, so a
 * direct browser call is rejected by CORS — verified against the deployed site,
 * where a normal fetch throws while the same request in `no-cors` mode succeeds
 * opaquely. The proxy is not optional.
 */
export interface FetchResult {
  posts: Post[];
  /** True when the live fetch failed and captured data was served instead. */
  snapshot: boolean;
  capturedAt: string | null;
}

export async function fetchHotPosts(subreddit: string): Promise<FetchResult> {
  const res = await fetch(`/api/subreddit/${encodeURIComponent(subreddit)}`);
  const body = await res.json();

  if (!res.ok) {
    throw new RedditError(body.error ?? "Couldn't load that subreddit.", res.status, body.hint);
  }

  return {
    posts: body.posts as Post[],
    snapshot: Boolean(body.snapshot),
    capturedAt: body.capturedAt ?? null,
  };
}
