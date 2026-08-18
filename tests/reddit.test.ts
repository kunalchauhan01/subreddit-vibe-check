import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import { normalizeSubreddit, parseListing, RedditError } from "../src/lib/reddit.ts";
import {
  explainFailure,
  fetchHotPostsFromReddit,
  type Attempt,
} from "../src/lib/reddit-server.ts";

const listing = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures-hot.json", import.meta.url)), "utf8"),
);

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Answer each upstream in order from a queue of [status, body] pairs. */
function queueResponses(responses: Array<[number, string]>) {
  const urls: string[] = [];
  let i = 0;

  globalThis.fetch = (async (url: string | URL) => {
    urls.push(String(url));
    const [status, body] = responses[Math.min(i++, responses.length - 1)];
    return new Response(body, { status });
  }) as typeof fetch;

  return urls;
}

test("accepts the shapes people actually paste", () => {
  for (const input of [
    "programming",
    "r/programming",
    "/r/programming",
    "  programming  ",
    "https://www.reddit.com/r/programming",
    "https://www.reddit.com/r/programming/",
  ]) {
    assert.equal(normalizeSubreddit(input), "programming", `failed on ${input}`);
  }
});

test("rejects names Reddit could never have", () => {
  for (const input of ["", "ab", "a".repeat(22), "has spaces", "punct!", "../etc"]) {
    assert.throws(() => normalizeSubreddit(input), RedditError, `should reject ${input}`);
  }
});

test("parses a listing and drops pinned mod threads", () => {
  const posts = parseListing(listing);

  assert.equal(posts.length, 50, "the two stickied threads should be gone");
  assert.ok(!posts.some((p) => p.author === "AutoModerator"));
  assert.equal(posts[0].permalink, "https://www.reddit.com/r/testsub/comments/p0/slug/");
  assert.equal(posts[0].flair, "Discussion");
});

test("the first working host wins and the rest are never called", async () => {
  const urls = queueResponses([[200, JSON.stringify(listing)]]);

  const { posts, attempts, via } = await fetchHotPostsFromReddit("testsub", 50);

  assert.equal(posts?.length, 50);
  assert.equal(via, "public", "no credentials configured in the test env");
  assert.equal(urls.length, 1, "should stop after the first success");
  assert.match(urls[0], /^https:\/\/www\.reddit\.com\//);
  assert.equal(attempts.length, 1);
  assert.ok(attempts[0].ok);
});

test("a blocked host falls through to the next one", async () => {
  const urls = queueResponses([
    [403, "blocked"],
    [200, JSON.stringify(listing)],
  ]);

  const { posts, attempts } = await fetchHotPostsFromReddit("testsub", 50);

  assert.equal(posts?.length, 50, "should recover on the second host");
  assert.equal(urls.length, 2);
  assert.match(urls[1], /^https:\/\/api\.reddit\.com\//);
  assert.equal(attempts[0].status, 403);
  assert.equal(attempts[0].snippet, "blocked");
});

test("an HTML challenge counts as a failure, not a parse crash", async () => {
  queueResponses([[200, "<!DOCTYPE html><title>Just a moment...</title>"]]);

  const { posts, attempts } = await fetchHotPostsFromReddit("testsub", 50);

  assert.equal(posts, null);
  assert.equal(attempts.length, 3, "should have tried every host");
  assert.equal(attempts[0].error, "response was not JSON");
});

test("every host failing reports it, and records each attempt", async () => {
  queueResponses([[403, "blocked"]]);

  const { posts, attempts, via } = await fetchHotPostsFromReddit("testsub", 50);

  assert.equal(posts, null);
  assert.equal(via, null);
  assert.equal(attempts.length, 3);
});

test("the real production failure: a 403 challenge page from every host", async () => {
  // Verbatim shape of what Reddit returned to the deployed app.
  queueResponses([[403, "<body class=theme-beta><div><style>.theme-light,:root{--rem360"]]);

  const { posts, attempts } = await fetchHotPostsFromReddit("programming", 5);
  assert.equal(posts, null);

  const failure = explainFailure("programming", attempts);
  assert.equal(failure.status, 403);
  assert.match(failure.message, /refused the request/i);
  // Without credentials the hint has to point at the actual fix.
  assert.match(String(failure.hint), /credentials/i);
});

test("blanket 403s read as a network block, not a private subreddit", () => {
  const allBlocked: Attempt[] = [403, 403, 403].map((status) => ({
    url: "x",
    status,
    ok: false,
  }));

  const error = explainFailure("programming", allBlocked);
  assert.match(error.message, /refused the request/i);
  assert.match(String(error.hint), /blocking anonymous requests from this server/i);
});

test("a single 403 among successes-elsewhere reads as a private subreddit", () => {
  const mixed: Attempt[] = [
    { url: "x", status: 403, ok: false },
    { url: "y", status: 404, ok: false },
    { url: "z", status: 500, ok: false },
  ];

  assert.match(explainFailure("secretclub", mixed).message, /private or quarantined/i);
});

test("404 everywhere means the subreddit doesn't exist", () => {
  const missing: Attempt[] = [404, 404, 404].map((status) => ({
    url: "x",
    status,
    ok: false,
  }));

  const error = explainFailure("nosuchsub", missing);
  assert.equal(error.status, 404);
  assert.match(error.message, /doesn't exist/i);
});
