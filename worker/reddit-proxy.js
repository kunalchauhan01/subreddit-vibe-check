/**
 * Cloudflare Worker: a minimal Reddit read proxy.
 *
 * Reddit answers 403 to anonymous requests from AWS ranges, which is what
 * Vercel runs on. Cloudflare Workers egress from Cloudflare's own network, so
 * this exists purely to make the outbound request from somewhere Reddit will
 * still talk to. It also adds the CORS headers Reddit doesn't send.
 *
 * GET /<subreddit>?limit=50
 *
 * Deploy: dash.cloudflare.com → Workers & Pages → Create → Worker →
 * "Edit code" → paste this over the default → Deploy.
 */

const SUBREDDIT = /^[A-Za-z0-9_]{3,21}$/;

const USER_AGENT = "web:subreddit-vibe-check:v1.0.0 (by /u/Basic-Atmosphere-395)";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(payload, status) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

const worker = {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return json({ error: "Only GET is supported." }, 405);
    }

    const url = new URL(request.url);
    const subreddit = decodeURIComponent(url.pathname.replace(/^\/+|\/+$/g, ""));

    // Without this the worker is an open proxy to any Reddit path.
    if (!SUBREDDIT.test(subreddit)) {
      return json(
        { error: "Expected /<subreddit>, 3-21 characters, letters/digits/underscore." },
        400,
      );
    }

    const requested = Number(url.searchParams.get("limit"));
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 50;

    const upstream = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}&raw_json=1`;

    let res;
    try {
      res = await fetch(upstream, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch (error) {
      return json({ error: "Upstream request failed.", detail: String(error) }, 502);
    }

    const body = await res.text();

    // Surface a challenge page as a clear error rather than passing HTML through
    // as if it were a listing.
    if (!res.ok || body.trimStart().startsWith("<")) {
      return json(
        {
          error: "Reddit refused the request.",
          upstreamStatus: res.status,
          snippet: body.slice(0, 200),
        },
        res.ok ? 502 : res.status,
      );
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json",
        "Cache-Control": "s-maxage=120",
      },
    });
  },
};

export default worker;
