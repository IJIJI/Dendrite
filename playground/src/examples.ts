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
    id: "closures",
    name: "Closures & currying",
    source: `// Lambdas are first-class values: bindings hold them, ops take them,
// and closures capture what they see - including other functions.

let add   = (a: number) => (b: number) => a + b
let add10 = add(10)

// A function-typed parameter: twice(f) applies f two times.
let twice = (f: (number) -> number) => (x: number) => f(f(x))
let add20 = twice(add10)

output curried  = add(2)(3)
output partial  = add10($n)
output composed = add20($n)
`,
    setup(lang) {
      lang.registerInput({ name: "n", type: Type.number, default: 5 });
      lang.registerOutput({ name: "curried", type: Type.number });
      lang.registerOutput({ name: "partial", type: Type.number });
      lang.registerOutput({ name: "composed", type: Type.number });
    },
  },
  {
    id: "operators",
    name: "Operators tour",
    source: `// Operators are stdlib sugar that desugars to ops:
//   a + b   ->  Add(a, b)          x >= y  ->  Not(LessThan(x, y))
// Precedence follows the usual ladder (* binds tighter than +, && than ||).

let sum     = $a + $b * 2
let inRange = $a >= 0 && $a <= 100
let notZero = !($a == 0)
let winner  = If($a > $b, "a wins", If($b > $a, "b wins", "tie"))

output sum     = sum
output inRange = inRange
output notZero = notZero
output winner  = winner
`,
    setup(lang) {
      lang.registerInput({ name: "a", type: Type.number, default: 7 });
      lang.registerInput({ name: "b", type: Type.number, default: 3 });
      lang.registerOutput({ name: "sum", type: Type.number });
      lang.registerOutput({ name: "inRange", type: Type.boolean });
      lang.registerOutput({ name: "notZero", type: Type.boolean });
      lang.registerOutput({ name: "winner", type: Type.string });
    },
  },
  {
    id: "structs",
    name: "Struct typing (nested)",
    source: `// Struct types come from the language definition: field access is checked
// and typed through nested structs. Try misspelling a field ($user.naem)
// to see the unknown_field error.

let name  = $user.name.first
let adult = $user.age >= 18

output label = If(adult, name, "minor")
output adult = adult
output city  = $user.address.city
`,
    setup(lang) {
      lang.registerType("Name", z.unknown(), {
        fields: { first: Type.string, last: Type.string },
      });
      lang.registerType("Address", z.unknown(), {
        fields: { city: Type.string, zip: Type.string },
      });
      lang.registerType("User", z.unknown(), {
        fields: { name: Type.name("Name"), age: Type.number, address: Type.name("Address") },
      });
      lang.registerInput({
        name: "user",
        type: Type.name("User"),
        default: {
          name: { first: "Ada", last: "Lovelace" },
          age: 36,
          address: { city: "London", zip: "N1" },
        },
      });
      lang.registerOutput({ name: "label", type: Type.string });
      lang.registerOutput({ name: "adult", type: Type.boolean });
      lang.registerOutput({ name: "city", type: Type.string });
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
