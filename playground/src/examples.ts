import { type Language, Type } from "@dendrite-lang/core";
import { z } from "zod";

//? Preset examples. Each registers its own inputs/outputs (and types) on a fresh stdlib
// language via setup() - the inputs panel is generated from exactly what setup registers.

export interface Example {
  id: string;
  name: string;
  source: string;
  setup(lang: Language): void;
}

export const examples: Example[] = [
  {
    id: "grade",
    name: "Grader (operators + lambdas)",
    source: `// Compute a grade from a score and a bonus.
// Inputs use the $ sigil; try changing $score / $bonus on the right.

let passing  = $score >= 60
let grade    = If(passing, "Pass", "Fail")

// Deliberate type error (And expects booleans) - see the diagnostics pane.
// It only poisons this unused binding; the outputs still run.
let madagascar = And(true, "Country")

let adjust   = (x: number) => x + $bonus
let adjusted = adjust(x: $score)
let topMark  = adjusted > 100
let label    = If(topMark, "Distinction", grade)

output result     = label
output finalScore = adjusted
`,
    setup(lang) {
      lang.registerInput({ name: "score", type: Type.number, default: 45 });
      lang.registerInput({ name: "bonus", type: Type.number, default: 0 });
      lang.registerOutput({ name: "result", type: Type.string });
      lang.registerOutput({ name: "finalScore", type: Type.number });
    },
  },
  {
    id: "tally",
    name: "Bus tally (structs + list ops)",
    source: `// Beacon-style tally: which watched source is live, at what priority?
// $busses is a typed struct array - try editing the JSON on the right,
// or misspell a field (bus.staet) to see struct typing catch it.

let active = Filter($busses, bus => And(bus.enabled, Some(bus.sources, s => Includes($watched, s))))

output tally = Max(Map(active, bus => bus.state))
`,
    setup(lang) {
      lang.registerType("Bus", z.unknown(), {
        fields: {
          state: Type.number,
          enabled: Type.boolean,
          sources: Type.array(Type.string),
        },
      });
      lang.registerInput({
        name: "busses",
        type: Type.array(Type.name("Bus")),
        default: [
          { state: 20, enabled: true, sources: ["atem:cam1", "atem:cam2"] },
          { state: 16, enabled: true, sources: ["atem:cam3"] },
          { state: 8, enabled: false, sources: ["atem:cam1"] },
        ],
      });
      lang.registerInput({
        name: "watched",
        type: Type.array(Type.string),
        default: ["atem:cam1"],
      });
      lang.registerOutput({ name: "tally", type: Type.number });
    },
  },
  {
    id: "scratch",
    name: "Scratchpad",
    source: `// A blank slate with two number inputs ($a, $b).

output out = $a + $b
`,
    setup(lang) {
      lang.registerInput({ name: "a", type: Type.number, default: 1 });
      lang.registerInput({ name: "b", type: Type.number, default: 2 });
      lang.registerOutput({ name: "out", type: Type.any });
    },
  },
];
