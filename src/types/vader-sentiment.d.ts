// vader-sentiment ships plain JS with no bundled types, so declare the one
// surface we call.
declare module "vader-sentiment" {
  export interface PolarityScores {
    neg: number;
    neu: number;
    pos: number;
    /** Normalized, weighted composite in the range -1..1. */
    compound: number;
  }

  export const SentimentIntensityAnalyzer: {
    polarity_scores(input: string): PolarityScores;
  };
}
