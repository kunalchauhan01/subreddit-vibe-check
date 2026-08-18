/**
 * Capture real Reddit listings for the preset subreddits.
 *
 * Reddit answers 403 to requests from cloud IP ranges, so the deployed app can't
 * reach it (see the README). Run this from a normal internet connection and the
 * deployment gets real data to fall back on instead of an error page.
 *
 *   npm run snapshot
 *
 * Writes src/data/snapshots.json. Re-run whenever the data feels stale.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../src/data/snapshots.json");

const SUBREDDITS = ["wholesomememes", "aww", "science", "programming", "news", "AskReddit"];

const USER_AGENT = "web:subreddit-vibe-check:v1.0.0 (by /u/Basic-Atmosphere-395)";

function toPost(data) {
  return {
    id: data.id,
    title: data.title,
    author: data.author,
    score: data.score,
    comments: data.num_comments,
    permalink: `https://www.reddit.com${data.permalink}`,
    createdUtc: data.created_utc,
    flair: data.link_flair_text ?? null,
    nsfw: data.over_18,
  };
}

async function capture(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=50&raw_json=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  if (!res.ok) {
    throw new Error(
      `${subreddit}: HTTP ${res.status}. If this is 403, you're on a network Reddit blocks — ` +
        `run it from a home connection rather than a VPN or a cloud shell.`,
    );
  }

  const json = await res.json();
  const posts = (json.data?.children ?? [])
    .filter((child) => child.kind === "t3" && !child.data.stickied)
    .map((child) => toPost(child.data));

  if (posts.length === 0) throw new Error(`${subreddit}: listing was empty`);
  return posts;
}

const snapshots = {};

for (const subreddit of SUBREDDITS) {
  process.stdout.write(`  r/${subreddit} … `);
  try {
    const posts = await capture(subreddit);
    snapshots[subreddit.toLowerCase()] = posts;
    console.log(`${posts.length} posts`);
  } catch (error) {
    console.log(`FAILED — ${error.message}`);
  }

  // Reddit asks for no more than one request per second.
  await new Promise((r) => setTimeout(r, 1200));
}

const captured = Object.keys(snapshots).length;
if (captured === 0) {
  console.error("\nNothing captured. Nothing written.");
  process.exit(1);
}

await mkdir(dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), snapshots }, null, 2)}\n`,
);

console.log(`\nWrote ${captured} subreddit(s) to src/data/snapshots.json`);
