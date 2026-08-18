import Dashboard from "@/components/Dashboard";

/**
 * The only thing the server does is read the query string. Reddit itself is
 * called from the browser (see `lib/reddit.ts` for why), so there is nothing to
 * fetch here — `?r=programming` just seeds the dashboard with a subreddit to load.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = await searchParams;

  return <Dashboard initialSubreddit={r ?? ""} />;
}
