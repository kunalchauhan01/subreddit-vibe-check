"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHotPosts, normalizeSubreddit, RedditError } from "@/lib/reddit";
import { buildReport } from "@/lib/sentiment";
import type { VibeReport } from "@/lib/types";
import PostTable from "./PostTable";
import SubredditForm from "./SubredditForm";
import ToneDistribution from "./ToneDistribution";
import VibeSummary from "./VibeSummary";

interface Failure {
  message: string;
  hint?: string;
}

interface Provenance {
  snapshot: boolean;
  capturedAt: string | null;
}

type Outcome =
  | { report: VibeReport; provenance: Provenance; failure: null }
  | { report: null; provenance: null; failure: Failure };

/**
 * Fetch and score, with no state of its own. Keeping this separate from the
 * component's state updates is what lets the deep-link effect below stay clean.
 */
async function loadReport(input: string): Promise<Outcome> {
  try {
    const subreddit = normalizeSubreddit(input);
    const { posts, snapshot, capturedAt } = await fetchHotPosts(subreddit);
    return {
      report: buildReport(subreddit, posts),
      provenance: { snapshot, capturedAt },
      failure: null,
    };
  } catch (error) {
    if (error instanceof RedditError) {
      return {
        report: null,
        provenance: null,
        failure: { message: error.message, hint: error.hint },
      };
    }
    return {
      report: null,
      provenance: null,
      failure: { message: "Something went wrong scoring that subreddit." },
    };
  }
}

function SnapshotNotice({ capturedAt }: { capturedAt: string | null }) {
  const when = capturedAt
    ? new Date(capturedAt).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div
      className="panel p-4"
      style={{ borderColor: "var(--tone-neutral)" }}
      role="note"
    >
      <p className="text-sm font-semibold text-ink">
        Showing captured data{when ? `, taken ${when}` : ""} — not live.
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
        Reddit blocks requests from cloud hosting providers, so this deployment
        can&apos;t reach it. Everything below is real Reddit data captured from an
        ordinary connection and scored the same way. Run the project locally for
        live results — see the README.
      </p>
    </div>
  );
}

export default function Dashboard({ initialSubreddit }: { initialSubreddit: string }) {
  const [subreddit, setSubreddit] = useState(initialSubreddit);
  const [report, setReport] = useState<VibeReport | null>(null);
  const [provenance, setProvenance] = useState<Provenance | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  // Seeded true when there's a deep link, so the effect below never has to set
  // it synchronously — the first paint already shows the loading state.
  const [pending, setPending] = useState(Boolean(initialSubreddit));

  // Guards against a slow request landing after a faster one that came later.
  const requestId = useRef(0);

  const apply = useCallback((id: number, outcome: Outcome) => {
    if (id !== requestId.current) return;
    setReport(outcome.report);
    setProvenance(outcome.provenance);
    setFailure(outcome.failure);
    setPending(false);
  }, []);

  const load = useCallback(
    async (name: string) => {
      const id = ++requestId.current;
      setSubreddit(name);
      setPending(true);
      setFailure(null);

      const outcome = await loadReport(name);
      apply(id, outcome);

      if (outcome.report) {
        const url = new URL(window.location.href);
        url.searchParams.set("r", outcome.report.subreddit);
        window.history.replaceState(null, "", url);
      }
    },
    [apply],
  );

  // Deep link: /?r=programming. Every state update happens after the await, so
  // this never triggers a synchronous cascade on mount.
  useEffect(() => {
    if (!initialSubreddit) return;

    const id = ++requestId.current;
    void loadReport(initialSubreddit).then((outcome) => apply(id, outcome));
  }, [initialSubreddit, apply]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          The Subreddit Vibe Check
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-secondary">
          Pulls the 50 hottest posts from any public subreddit and scores every
          title with VADER, a sentiment model built for short social text. The
          scoring runs in your browser.
        </p>
      </header>

      <div className="mt-7">
        <SubredditForm value={subreddit} pending={pending} onSubmit={load} />
      </div>

      {failure && (
        <div
          role="alert"
          className="panel mt-8 p-5"
          style={{ borderColor: "var(--tone-negative)" }}
        >
          <p className="text-sm font-semibold text-ink">{failure.message}</p>
          {failure.hint && (
            <p className="mt-1 text-sm text-ink-secondary">{failure.hint}</p>
          )}
        </div>
      )}

      {report && (
        // Refetching holds the previous render at reduced opacity instead of
        // dropping to a skeleton, so the page never jumps.
        <div
          className={`mt-8 flex flex-col gap-4 transition-opacity ${
            pending ? "opacity-40" : "opacity-100"
          }`}
          aria-busy={pending}
        >
          {provenance?.snapshot && <SnapshotNotice capturedAt={provenance.capturedAt} />}
          <VibeSummary report={report} />
          <ToneDistribution report={report} />
          <PostTable posts={report.posts} />
        </div>
      )}

      {!report && !failure && (
        <div className="panel mt-8 p-8 text-center sm:p-12">
          <p className="text-sm font-medium text-ink">
            {pending ? `Reading r/${subreddit}…` : "Pick a subreddit to get started."}
          </p>
          {!pending && (
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">
              Type a name above or tap one of the suggestions. Results are
              shareable — the subreddit ends up in the URL.
            </p>
          )}
        </div>
      )}

      <footer className="mt-12 border-t border-hairline pt-6 text-xs leading-relaxed text-ink-muted">
        <p>
          Scores come from VADER&apos;s compound metric, which runs −1 to +1.
          Titles between −0.05 and +0.05 count as neutral. It reads one line of
          text at a time, so sarcasm and in-jokes go straight past it — treat the
          numbers as a rough temperature, not a verdict.
        </p>
      </footer>
    </main>
  );
}
