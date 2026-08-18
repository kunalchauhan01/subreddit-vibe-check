import assert from "node:assert/strict";
import test from "node:test";
import { buildReport, scorePost } from "../src/lib/sentiment.ts";
import type { Post } from "../src/lib/types.ts";

function post(title: string, id = "x"): Post {
  return {
    id,
    title,
    author: "someone",
    score: 10,
    comments: 2,
    permalink: "https://www.reddit.com/r/test/comments/x/",
    createdUtc: 1_700_000_000,
    flair: null,
    nsfw: false,
  };
}

test("negation flips the sign — the reason for picking VADER", () => {
  const good = scorePost(post("This is good"));
  const notGood = scorePost(post("This is not good"));

  assert.equal(good.tone, "positive");
  assert.equal(notGood.tone, "negative");
});

test("emphasis intensifies rather than just adding words", () => {
  const plain = scorePost(post("The release is great"));
  const shouted = scorePost(post("The release is GREAT!!!"));

  assert.ok(
    shouted.compound > plain.compound,
    `expected ${shouted.compound} > ${plain.compound}`,
  );
});

test("titles with no affect land in the neutral band", () => {
  const scored = scorePost(post("Changelog for version 4.2"));

  assert.equal(scored.tone, "neutral");
  assert.ok(Math.abs(scored.compound) < 0.05);
});

test("percentages always total exactly 100", () => {
  // 3, 7 and 11 posts all produce thirds that do not round cleanly.
  for (const size of [3, 7, 11, 49, 50]) {
    const posts = Array.from({ length: size }, (_, index) =>
      post(
        index % 3 === 0
          ? "I love this, wonderful"
          : index % 3 === 1
            ? "This is awful and I hate it"
            : "Notes from the meeting",
        `p${index}`,
      ),
    );

    const report = buildReport("test", posts);
    const { positive, neutral, negative } = report.percentages;

    assert.equal(
      positive + neutral + negative,
      100,
      `sizes of ${size} summed to ${positive + neutral + negative}`,
    );
  }
});

test("counts add up to the number of posts scored", () => {
  const posts = ["Great stuff", "Awful stuff", "Some stuff"].map((t, i) =>
    post(t, `p${i}`),
  );
  const report = buildReport("test", posts);

  assert.equal(
    report.counts.positive + report.counts.neutral + report.counts.negative,
    report.postCount,
  );
  assert.equal(report.postCount, 3);
});

test("extremes pick the actual endpoints, and stay null when absent", () => {
  const mixed = buildReport("test", [
    post("Absolutely wonderful, I love it", "a"),
    post("Meeting notes", "b"),
    post("This is terrible and awful", "c"),
  ]);

  assert.equal(mixed.mostPositive?.id, "a");
  assert.equal(mixed.mostNegative?.id, "c");

  const flat = buildReport("test", [post("Meeting notes", "b")]);
  assert.equal(flat.mostPositive, null);
  assert.equal(flat.mostNegative, null);
});

test("a uniformly cheerful feed reads as upbeat", () => {
  const posts = Array.from({ length: 10 }, (_, i) =>
    post("Wonderful news, I am so happy and grateful", `p${i}`),
  );
  const report = buildReport("test", posts);

  assert.ok(report.meanCompound > 0.35);
  assert.equal(report.verdict, "Genuinely upbeat");
  assert.equal(report.percentages.positive, 100);
});
