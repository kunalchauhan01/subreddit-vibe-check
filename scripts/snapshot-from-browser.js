/**
 * Capture snapshots from a browser tab, when `npm run snapshot` can't.
 *
 * Reddit fingerprints clients beyond the IP: a Node process on the same home
 * connection that serves a browser fine still gets a 403 challenge. A real
 * browser on a reddit.com tab is same-origin and passes.
 *
 * How to use:
 *   1. Open https://www.reddit.com in a tab and log in (or don't — either works).
 *   2. Open DevTools (F12) → Console.
 *   3. Paste this whole file, press Enter, wait ~10 seconds.
 *   4. It downloads snapshots.json — move it to src/data/snapshots.json.
 *
 * Same output as scripts/snapshot.mjs, so the app can't tell which produced it.
 */
(async () => {
  const SUBREDDITS = [
    "wholesomememes",
    "aww",
    "science",
    "programming",
    "news",
    "AskReddit",
  ];

  const snapshots = {};

  for (const subreddit of SUBREDDITS) {
    try {
      const res = await fetch(
        `https://www.reddit.com/r/${subreddit}/hot.json?limit=50&raw_json=1`,
      );

      if (!res.ok) {
        console.log(`r/${subreddit} — FAILED, HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const posts = (json.data?.children ?? [])
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

      snapshots[subreddit.toLowerCase()] = posts;
      console.log(`r/${subreddit} — ${posts.length} posts`);
    } catch (error) {
      console.log(`r/${subreddit} — FAILED, ${error.message}`);
    }

    // Reddit asks for no more than one request per second.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const captured = Object.keys(snapshots).length;
  if (captured === 0) {
    console.log("Nothing captured — is this tab actually on reddit.com?");
    return;
  }

  const payload = JSON.stringify(
    { capturedAt: new Date().toISOString(), snapshots },
    null,
    2,
  );

  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  link.download = "snapshots.json";
  link.click();

  console.log(`Downloaded snapshots.json — ${captured} subreddits. Move it to src/data/.`);
})();
