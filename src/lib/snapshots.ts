import data from "../data/snapshots.json";
import type { Post } from "./types.ts";

/**
 * Captured Reddit listings, used only when the live fetch fails.
 *
 * Reddit answers 403 to anonymous requests from cloud IP ranges — verified
 * against this app's own deployment and against a Cloudflare Worker, both of
 * which received the same bot-challenge page. A hosted copy therefore cannot
 * reach Reddit, while a local one can.
 *
 * Rather than show an error page, the route falls back to data captured by
 * `npm run snapshot` from an ordinary connection. The UI always states that it
 * is serving a snapshot and when it was taken: the goal is to demonstrate the
 * dashboard, not to imply the data is live.
 *
 * The committed file starts empty, so the app builds before anyone has run the
 * capture script.
 */
interface SnapshotFile {
  capturedAt: string | null;
  snapshots: Record<string, Post[]>;
}

const file = data as SnapshotFile;

export const snapshotCapturedAt = file.capturedAt;

export function getSnapshot(subreddit: string): Post[] | null {
  return file.snapshots[subreddit.toLowerCase()] ?? null;
}
