import { type Ports, Type } from "@dendrite-lang/core";

import scores from "./scores.den?raw";

//? The programs the site runs live, as `.den` files rather than strings in a page: one
// definition wherever an example appears twice, and `content.test.ts` loads every one of
// them against the real pipeline, so an example cannot rot. The ports live here beside the
// source because a `.den` file cannot carry them - the source is the program, this is the
// contract the page mounts it under.

export interface Example {
  /** The program text, from its `.den` file. */
  source: string;
  /** What it reads and produces, as the page declares it. */
  ports: Ports;
}

/** A filter over a list of numbers, with the threshold as a settable input. */
export const scoresExample: Example = {
  source: scores,
  ports: {
    inputs: [{ name: "threshold", type: Type.number, default: 10 }],
    outputs: [
      { name: "count", type: Type.number },
      { name: "any", type: Type.boolean },
    ],
  },
};

/** Every example, for the test that loads them all. */
export const examples: Record<string, Example> = { scores: scoresExample };
