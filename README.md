# The Subreddit Vibe Check

Fetches the 50 hottest posts from any public subreddit and scores every title
for sentiment, then shows how the community is leaning right now.

## **Live:** https://subreddit-vibe-check-sage-gamma.vercel.app/?r=science

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

Runs with no configuration locally. A **deployment needs Reddit app
credentials** — see [below](#why-a-deployment-needs-credentials) for why, and
`.env.example` for the two variables.

```bash
npm test             # 18 unit tests, Node's built-in runner
npm run lint
npm run build
npm run snapshot     # capture real listings for the offline fallback
```

---

## How it works

```
browser ──► /api/subreddit/[name] ──► Reddit
   │                                    │
   │        ◄── 50 posts (JSON) ─────────
   │
   └─► VADER scores the titles, in the browser
```

- **`src/lib/reddit.ts`** — validation, listing parsing, the error type. Shared.
- **`src/lib/reddit-server.ts`** — the upstream fetch, OAuth, server-side only.
- **`src/app/api/subreddit/[name]/route.ts`** — a thin proxy, nothing else.
- **`src/lib/sentiment.ts`** — VADER scoring and the aggregate report.

### Why the requests go through a server route

Two reasons, both confirmed by testing rather than assumption.

**Reddit doesn't send CORS headers for arbitrary origins.** A direct browser
call is rejected. This one is easy to get wrong: the same `fetch` from a
`localhost` page can succeed while the identical call from a deployed origin
fails. Run from the deployed page's console:

```js
fetch("https://www.reddit.com/r/news/hot.json?limit=2"); // throws
fetch("https://www.reddit.com/r/news/hot.json?limit=2", { mode: "no-cors" }); // resolves, opaque
```

`no-cors` succeeding proves the network path is fine and CORS is the blocker
specifically — not a blocked domain or an offline host.

**Reddit rate limits clients without a descriptive `User-Agent`,** and
`User-Agent` is a forbidden header name in browsers — scripts cannot set it.

Sentiment analysis deliberately does _not_ happen in the route. It runs in the
browser, so the server stays a pure data hop.

### Why a deployment needs credentials

Reddit answers **403 with a bot-challenge page** to anonymous requests from
cloud IP ranges. Not a guess — `/api/diag` on this project's own Vercel
deployment returned exactly that from all three public hosts, with
`old.reddit.com` serving a page literally titled "Blocked":

```json
{
  "reachable": false,
  "attempts": [
    {
      "url": "https://www.reddit.com/r/programming/hot.json...",
      "status": 403
    },
    { "url": "https://api.reddit.com/r/programming/hot...", "status": 403 },
    { "url": "https://old.reddit.com/r/programming/hot.json...", "status": 403 }
  ]
}
```

The authenticated API isn't filtered that way, so the route uses OAuth
(`client_credentials` against `oauth.reddit.com`) when `REDDIT_CLIENT_ID` and
`REDDIT_CLIENT_SECRET` are set, and falls back to the public hosts when they
aren't. That keeps `npm run dev` working from a home connection with zero
configuration while giving a deployment a path that actually works.

Tokens are cached in memory and retired a minute before expiry so an in-flight
request can't race the refresh.

To get credentials: create a **script** app at
<https://www.reddit.com/prefs/apps>. The client ID is the unlabelled string
under the app name; the secret is labelled. See `.env.example`.

### When app credentials aren't obtainable

Reddit now gates app creation behind its Responsible Builder Policy, and the
form at `/prefs/apps` can silently reject a submission — reloading blank with no
error — for accounts it won't approve. If that happens, there is a second way to
get the request out from an address Reddit answers.

`worker/reddit-proxy.js` is a Cloudflare Worker that fetches the listing and
adds CORS headers. Workers egress from Cloudflare's network rather than AWS, so
Reddit's cloud-IP block doesn't apply. Deploy it, set `REDDIT_PROXY_URL`, and
the route uses it ahead of the public hosts.

It is deliberately not an open proxy: only `/<subreddit>` matching
`^[A-Za-z0-9_]{3,21}$` is accepted, only GET, `limit` is clamped to 1–100, and a
challenge page from Reddit is surfaced as a structured error rather than passed
through as if it were a listing.

The order the route tries, using whichever is configured: OAuth → Worker →
public hosts. Local development needs none of them.

### Reading the failure modes

Reddit fails in ways that are easy to misreport, so two get handled explicitly:

- **A 200 containing HTML** (a bot challenge) is treated as a failed attempt,
  not fed to `JSON.parse`.
- **A 403 from every host** is reported as "Reddit refused the request", not
  "this subreddit is private" — several independent hosts all deciding a public
  subreddit is private is not the likely explanation. Without credentials
  configured, the hint says so.

`GET /api/diag` reports which path served the request, whether credentials are
configured, and what each host returned.

### What happens when Reddit won't answer at all

Every unauthenticated route into Reddit is closed from a hosting provider, and
this was established by testing rather than assumed:

| Route                                     | Result                                                            |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Browser → Reddit directly                 | CORS rejected (`no-cors` resolves opaque, so the network is fine) |
| Vercel → `www` / `api` / `old` reddit.com | **403** bot-challenge page from all three                         |
| Cloudflare Worker → Reddit                | **403**, same challenge page                                      |
| OAuth `client_credentials`                | app creation gated by Reddit's Responsible Builder Policy         |
| JSONP (`?jsonp=`)                         | no longer supported — the script fails to load                    |
| Node on a home connection                 | **403** — same network a browser is served on                     |

The same code works perfectly from an ordinary connection. The block is on the
IP range, not the code.

That last row is the interesting one: Reddit fingerprints the client, not just
the address. A Node process on the very connection that serves a browser fine
still gets challenged, so `npm run snapshot` may 403 too. When it does,
`scripts/snapshot-from-browser.js` does the same job pasted into the console of
a reddit.com tab, where the request is same-origin and passes.

Either way the output is `src/data/snapshots.json`, and the route serves it when
every live upstream fails. The UI says plainly that it is showing captured data and when it was
taken — the aim is to demonstrate the dashboard, not to imply the data is live.

Run locally and you get live Reddit, no configuration, no snapshot.

### Why VADER

`vader-sentiment` is a lexicon model tuned specifically for short social text,
which is exactly what a post title is. The alternative, `sentiment` (AFINN-165),
sums word scores and nothing else — so it reads "this is **not** good" as
positive, because _good_ is in the list and negation isn't modelled.

| Title                     | AFINN             | VADER                     |
| ------------------------- | ----------------- | ------------------------- |
| `This is not good`        | positive          | **negative**              |
| `The release is GREAT!!!` | same as lowercase | **scores higher**         |
| `Worst. Update. Ever.`    | negative          | **negative, intensified** |

Scores use VADER's `compound` metric (−1 to +1). Titles between −0.05 and +0.05
count as neutral — VADER's own recommended cutoffs.

### Why blue and red, not green and red

Sentiment is an ordered polarity scale, so the chart is a **diverging stacked
bar** centred on neutral: negative grows left, positive grows right, and the
asymmetry is the reading. A plain 100% stacked bar would throw away the lean.

The obvious colour choice — green for good, red for bad — is the single worst
pair for red-green colour blindness, which affects roughly 1 in 12 men. Blue and
red read as opposite to everyone. Both palettes were checked against a
colour-vision-deficiency simulation for perceptual distance and against their
own surface for contrast; the dark theme uses hues re-stepped for the dark
background rather than an automatic inversion.

Every value in the chart is also in the table underneath, so nothing is
hover-only.

### Other decisions worth noting

- **Pinned posts are dropped** before scoring. Rules threads sit at the top of
  a listing for months and would skew every single run for that subreddit.
- **Percentages use largest-remainder rounding**, so the three buckets total
  exactly 100 instead of occasionally landing on 99 or 101.
- **Subreddit names are validated before any request.** `r/foo`, `/r/foo` and a
  full reddit.com URL all normalise to the same thing; anything Reddit couldn't
  possibly have never leaves the browser.
- **Out-of-order responses can't win.** A request counter means a slow lookup
  landing after a later one is discarded rather than overwriting it.
- **Refetching holds the previous render** at reduced opacity — no skeleton
  flash, no layout jump.
- **No webfont.** The platform UI sans instead: one less request and no layout
  shift on first paint.

---

## Limitations

- Titles only. Post bodies and comments aren't scored, so a cheerful title on a
  grim thread reads as cheerful.
- VADER is a lexicon model. Sarcasm, irony, in-jokes and subreddit-specific
  slang all sail straight past it — the numbers are a temperature, not a verdict.
- A single 50-post snapshot of _hot_. It's a reading of this moment, not a trend.
- Private, quarantined and banned subreddits return an error by design.
- Reddit's tolerance for cloud IP ranges is theirs to change, and the
  unauthenticated path is already blocked there. `/api/diag` exists to make that
  visible in seconds rather than leaving it to guesswork.

---

## Development notes

Built with Next.js 16 (App Router), TypeScript and Tailwind CSS v4.

This project was written with AI assistance (Claude). I directed the
architecture and the design decisions documented above, reviewed the code, and
can walk through any part of it. Flagging it because it's the honest thing to
do, not because it changes what's here.

Author: Kunal Chauhan · kunalchauhan6767@gmail.com
