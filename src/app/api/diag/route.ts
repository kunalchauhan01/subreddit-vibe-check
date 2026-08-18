import { NextResponse } from "next/server";
import { fetchHotPostsFromReddit, hasCredentials, hasProxy } from "@/lib/reddit-server";

/**
 * Health check: reports which path served the request and exactly what each
 * Reddit host returned to this server.
 *
 * Whether Reddit serves a given host is not something you can determine locally
 * — it works from a home connection and 403s from a cloud IP. Rather than guess,
 * this makes the answer directly observable in production.
 */
export async function GET() {
  const started = Date.now();
  const { posts, attempts, via } = await fetchHotPostsFromReddit("programming", 5);

  return NextResponse.json(
    {
      reachable: posts !== null,
      via,
      credentialsConfigured: hasCredentials,
      proxyConfigured: hasProxy,
      postsParsed: posts?.length ?? 0,
      elapsedMs: Date.now() - started,
      attempts,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
