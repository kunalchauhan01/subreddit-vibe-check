"use client";

import { useState } from "react";

/**
 * A spread of subreddits that actually score differently — worth having on hand,
 * because a picker full of similar communities makes the tool look broken.
 */
const PRESETS = ["wholesomememes", "aww", "science", "programming", "news", "AskReddit"];

interface Props {
  value: string;
  pending: boolean;
  onSubmit: (subreddit: string) => void;
}

export default function SubredditForm({ value, pending, onSubmit }: Props) {
  const [draft, setDraft] = useState(value);

  function submit(next: string) {
    const trimmed = next.trim();
    if (!trimmed) return;
    setDraft(trimmed);
    onSubmit(trimmed);
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <div className="relative flex-1">
          <span
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-muted"
            aria-hidden="true"
          >
            r/
          </span>
          <label htmlFor="subreddit" className="sr-only">
            Subreddit name
          </label>
          <input
            id="subreddit"
            name="subreddit"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="programming"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="w-full rounded-lg border border-hairline bg-surface py-2.5 pl-8 pr-3.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-positive/50"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {pending ? "Checking…" : "Check the vibe"}
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-muted">Try:</span>
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => submit(preset)}
            className="rounded-full border border-hairline px-3 py-1 text-xs text-ink-secondary transition-colors hover:bg-wash hover:text-ink"
          >
            r/{preset}
          </button>
        ))}
      </div>
    </div>
  );
}
