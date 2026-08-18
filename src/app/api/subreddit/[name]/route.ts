import { NextResponse } from "next/server";
import { normalizeSubreddit, RedditError } from "@/lib/reddit";
import { explainFailure, fetchHotPostsFromReddit } from "@/lib/reddit-server";
import { getSnapshot, snapshotCapturedAt } from "@/lib/snapshots";

/**
 * Proxies Reddit's hot listing.
 *
 * Required, not incidental: Reddit doesn't send CORS headers for arbitrary
 * origins, so the browser can't call it directly, and it rate limits clients
 * that don't send a descriptive User-Agent — a header scripts aren't allowed to
 * set. Sentiment analysis deliberately does not happen here; it runs in the
 * browser, so this route stays a thin data hop.
 *
 * When every upstream fails — which is what happens on any cloud host, because
 * Reddit blocks those IP ranges — a captured snapshot is served instead, clearly
 * flagged. See `lib/snapshots.ts`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;

  try {
    const subreddit = normalizeSubreddit(decodeURIComponent(name));
    const { posts, attempts } = await fetchHotPostsFromReddit(subreddit, 50);

    if (posts) {
      return NextResponse.json(
        { subreddit, posts, snapshot: false },
        {
          // Reddit's hot listing barely moves minute to minute. A short shared
          // cache keeps repeat lookups snappy and us under the rate limit.
          headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=600" },
        },
      );
    }

    console.error("All upstreams failed for r/%s: %o", subreddit, attempts);

    const fallback = getSnapshot(subreddit);
    if (fallback) {
      return NextResponse.json(
        {
          subreddit,
          posts: fallback,
          snapshot: true,
          capturedAt: snapshotCapturedAt,
        },
        { headers: { "Cache-Control": "s-maxage=600" } },
      );
    }

    const failure = explainFailure(subreddit, attempts);
    return NextResponse.json(
      { error: failure.message, hint: failure.hint },
      { status: failure.status },
    );
  } catch (error) {
    if (error instanceof RedditError) {
      return NextResponse.json(
        { error: error.message, hint: error.hint },
        { status: error.status },
      );
    }

    console.error("Unexpected failure fetching subreddit:", error);
    return NextResponse.json(
      { error: "Something went wrong reaching Reddit." },
      { status: 500 },
    );
  }
}
