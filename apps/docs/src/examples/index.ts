import { type Ports, Type } from "@dendrite-lang/core";

import first from "./first.den?raw";
import grade from "./grade.den?raw";
import heights from "./heights.den?raw";
import order from "./order.den?raw";
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

const numbers = (...names: string[]) => names.map((name) => ({ name, type: Type.number }));

/** The first program anyone writes: one input, one binding, one output. */
export const firstExample: Example = {
  source: first,
  ports: {
    inputs: [{ name: "n", type: Type.number, default: 5 }],
    outputs: numbers("result"),
  },
};

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

/** Operators, a condition, and two outputs from one chain of bindings. */
export const gradeExample: Example = {
  source: grade,
  ports: {
    inputs: [
      { name: "score", type: Type.number, default: 72 },
      { name: "bonus", type: Type.number, default: 10 },
    ],
    outputs: [
      { name: "result", type: Type.string },
      { name: "finalScore", type: Type.number },
    ],
  },
};

/** Operators and a condition over two inputs, feeding two outputs. */
export const orderExample: Example = {
  source: order,
  ports: {
    inputs: [
      { name: "price", type: Type.number, default: 12.5 },
      { name: "quantity", type: Type.number, default: 2 },
    ],
    outputs: [
      { name: "total", type: Type.number },
      { name: "freeShipping", type: Type.boolean },
    ],
  },
};

/** List ops over three array inputs, with a lambda closing over an input. */
export const heightsExample: Example = {
  source: heights,
  ports: {
    inputs: [
      { name: "men", type: Type.array(Type.number), default: [180, 175, 190] },
      { name: "women", type: Type.array(Type.number), default: [165, 170, 160] },
      { name: "unknown", type: Type.array(Type.number), default: [170, 175, 180] },
      { name: "threshold", type: Type.number, default: 170 },
    ],
    outputs: [
      { name: "howManyTall", type: Type.number },
      { name: "average", type: Type.number },
    ],
  },
};

/** Every example, for the test that loads them all. */
export const examples: Record<string, Example> = {
  first: firstExample,
  order: orderExample,
  scores: scoresExample,
  grade: gradeExample,
  heights: heightsExample,
};
