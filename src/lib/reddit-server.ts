// Explicit extension: Node's type stripping (used by the test suite) needs the
// real filename, and the bundler resolves it the same way.
import { parseListing, RedditError, type RedditListing } from "./reddit.ts";
import type { Post } from "./types.ts";

/**
 * Server-side fetching. Only ever imported by the API routes — deliberately not
 * marked with `server-only`, so the test suite can exercise it under plain Node.
 *
 * Reddit asks that every client send a descriptive User-Agent, and rate limits
 * requests with a default or missing one far more aggressively. This header is
 * one of the two reasons the fetch can't happen in the browser — scripts aren't
 * allowed to set it. The other is that Reddit sends no CORS headers.
 */
const USER_AGENT = "web:subreddit-vibe-check:v1.0.0 (by /u/Basic-Atmosphere-395)";

const CLIENT_ID = process.env.REDDIT_CLIENT_ID;
const CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET;

/**
 * A Cloudflare Worker that fetches the listing on this app's behalf. Reddit
 * blocks AWS ranges (which is what Vercel runs on) but not Cloudflare's, so the
 * Worker exists purely to make the outbound request from an address Reddit will
 * still answer. Its source is in `worker/reddit-proxy.js`.
 */
const PROXY_URL = process.env.REDDIT_PROXY_URL?.replace(/\/+$/, "");

export const hasCredentials = Boolean(CLIENT_ID && CLIENT_SECRET);
export const hasProxy = Boolean(PROXY_URL);

/**
 * Reddit refuses anonymous requests from cloud IP ranges — verified against this
 * project's own deployment, where all three public hosts answered 403 with a
 * bot-challenge page. The authenticated API is not filtered that way, so app
 * credentials are what make a deployed copy work.
 *
 * They stay optional because `npm run dev` from a home connection needs none:
 * without them the public hosts are tried, which is fine locally and fails in
 * production. `/api/diag` reports which path is in use.
 */
const PUBLIC_HOSTS = [
  (sub: string, limit: number) =>
    `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
  (sub: string, limit: number) =>
    `https://api.reddit.com/r/${sub}/hot?limit=${limit}&raw_json=1`,
  (sub: string, limit: number) =>
    `https://old.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
];

interface CachedToken {
  value: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

/** Exposed so tests can start from a clean slate. */
export function resetTokenCache() {
  tokenCache = null;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.value;

  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new RedditError(
      "Could not authenticate with Reddit.",
      502,
      "Check REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET.",
    );
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };

  // Retire the token a minute early so an in-flight request can't race the expiry.
  tokenCache = {
    value: json.access_token,
    expiresAt: now + (json.expires_in - 60) * 1000,
  };

  return tokenCache.value;
}

export interface Attempt {
  url: string;
  status: number | null;
  ok: boolean;
  /** Present when the response wasn't usable — the first slice of the body. */
  snippet?: string;
  error?: string;
}

async function tryUpstream(
  url: string,
  headers: Record<string, string>,
): Promise<{ attempt: Attempt; posts: Post[] | null }> {
  try {
    const res = await fetch(url, { headers, cache: "no-store", redirect: "follow" });

    if (!res.ok) {
      const body = await res.text();
      return {
        attempt: { url, status: res.status, ok: false, snippet: body.slice(0, 200) },
        posts: null,
      };
    }

    const text = await res.text();

    // A challenge or interstitial comes back as 200 with HTML, which would
    // otherwise blow up in JSON.parse with a useless message.
    let json: RedditListing;
    try {
      json = JSON.parse(text) as RedditListing;
    } catch {
      return {
        attempt: {
          url,
          status: res.status,
          ok: false,
          snippet: text.slice(0, 200),
          error: "response was not JSON",
        },
        posts: null,
      };
    }

    const posts = parseListing(json);
    if (posts.length === 0) {
      return {
        attempt: { url, status: res.status, ok: false, error: "listing had no usable posts" },
        posts: null,
      };
    }

    return { attempt: { url, status: res.status, ok: true }, posts };
  } catch (error) {
    return {
      attempt: {
        url,
        status: null,
        ok: false,
        error: error instanceof Error ? error.message : "network failure",
      },
      posts: null,
    };
  }
}

export interface UpstreamResult {
  posts: Post[] | null;
  attempts: Attempt[];
  /** Which path produced the posts, for the diagnostics endpoint. */
  via: "oauth" | "proxy" | "public" | null;
}

/**
 * Try the authenticated API first when credentials exist, then the public hosts.
 *
 * The public hosts stay in the chain even with credentials configured: if a
 * token request fails transiently, a local or home-network deployment can still
 * serve a result rather than erroring outright.
 */
export async function fetchHotPostsFromReddit(
  subreddit: string,
  limit = 50,
): Promise<UpstreamResult> {
  const attempts: Attempt[] = [];

  if (hasCredentials) {
    const url = `https://oauth.reddit.com/r/${subreddit}/hot?limit=${limit}&raw_json=1`;
    try {
      const token = await getAccessToken();
      const { attempt, posts } = await tryUpstream(url, {
        Authorization: `bearer ${token}`,
        "User-Agent": USER_AGENT,
      });
      attempts.push(attempt);
      if (posts) return { posts, attempts, via: "oauth" };
    } catch (error) {
      attempts.push({
        url,
        status: null,
        ok: false,
        error: error instanceof Error ? error.message : "token request failed",
      });
    }
  }

  if (PROXY_URL) {
    const { attempt, posts } = await tryUpstream(
      `${PROXY_URL}/${subreddit}?limit=${limit}`,
      { Accept: "application/json" },
    );
    attempts.push(attempt);
    if (posts) return { posts, attempts, via: "proxy" };
  }

  for (const build of PUBLIC_HOSTS) {
    const { attempt, posts } = await tryUpstream(build(subreddit, limit), {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    });
    attempts.push(attempt);
    if (posts) return { posts, attempts, via: "public" };
  }

  return { posts: null, attempts, via: null };
}

/**
 * Turn a set of failed attempts into the most accurate message we can manage.
 *
 * The important distinction is between "this subreddit is unavailable", which is
 * the user's problem to fix, and "Reddit refused this server", which isn't.
 */
export function explainFailure(subreddit: string, attempts: Attempt[]): RedditError {
  const statuses = attempts.map((a) => a.status);

  if (statuses.every((s) => s === 404)) {
    return new RedditError(`r/${subreddit} doesn't exist.`, 404, "Check the spelling.");
  }

  if (statuses.includes(429)) {
    return new RedditError(
      "Reddit is rate limiting this server.",
      429,
      "Give it a minute and try again.",
    );
  }

  // A 403 on every host is far more likely to be Reddit blocking the request
  // than several different hosts all deciding this subreddit is private.
  if (statuses.every((s) => s === 403)) {
    return new RedditError(
      `Reddit refused the request for r/${subreddit}.`,
      403,
      hasCredentials || hasProxy
        ? "The subreddit may be private."
        : "Reddit is blocking anonymous requests from this server. Set REDDIT_PROXY_URL or app credentials.",
    );
  }

  if (statuses.includes(403)) {
    return new RedditError(
      `r/${subreddit} is private or quarantined.`,
      403,
      "Public subreddits only.",
    );
  }

  return new RedditError(
    "Couldn't load that subreddit from Reddit.",
    502,
    "Reddit didn't return a usable response.",
  );
}
