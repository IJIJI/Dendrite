import { serialiseSource, Type } from "@dendrite-lang/core";
import { DOCUMENT_VERSION, type EditorDocument, type SurfaceSpec } from "@dendrite-lang/editor";

//? Preset documents. An example is just an EditorDocument you can load into the
// session - its surface is DATA (SurfaceSpec), so presets, share URLs, and the future
// input/output UI all speak the same structure. Input values are seeded from the
// surface defaults at boot; presets only override them when they need to.

export interface ExamplePreset {
  id: string;
  name: string;
  document: EditorDocument;
}

const doc = (source: string, surface: SurfaceSpec): EditorDocument => ({
  v: DOCUMENT_VERSION,
  program: serialiseSource(source),
  surface,
  inputValues: {},
});

export const examples: ExamplePreset[] = [
  {
    id: "grade",
    name: "Grader (operators + lambdas)",
    document: doc(
      `// Compute a grade from a score and a bonus.
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
      {
        inputs: [
          { name: "score", type: Type.number, default: 45 },
          { name: "bonus", type: Type.number, default: 0 },
        ],
        outputs: [
          { name: "result", type: Type.string },
          { name: "finalScore", type: Type.number },
        ],
      },
    ),
  },
  {
    id: "tally",
    name: "Bus tally (structs + list ops)",
    document: doc(
      `// Beacon-style tally: which watched source is live, at what priority?
// $busses is a typed struct array - try editing the JSON on the right,
// or misspell a field (bus.staet) to see struct typing catch it.

let active = Filter($busses, bus => And(bus.enabled, Some(bus.sources, s => Includes($watched, s))))

output tally = Max(Map(active, bus => bus.state))
`,
      {
        types: [
          {
            name: "Bus",
            fields: {
              state: Type.number,
              enabled: Type.boolean,
              sources: Type.array(Type.string),
            },
          },
        ],
        inputs: [
          {
            name: "busses",
            type: Type.array(Type.name("Bus")),
            default: [
              { state: 20, enabled: true, sources: ["atem:cam1", "atem:cam2"] },
              { state: 16, enabled: true, sources: ["atem:cam3"] },
              { state: 8, enabled: false, sources: ["atem:cam1"] },
            ],
          },
          { name: "watched", type: Type.array(Type.string), default: ["atem:cam1"] },
        ],
        outputs: [{ name: "tally", type: Type.number }],
      },
    ),
  },
  {
    id: "closures",
    name: "Closures & currying",
    document: doc(
      `// Lambdas are first-class values: bindings hold them, ops take them,
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
      {
        inputs: [{ name: "n", type: Type.number, default: 5 }],
        outputs: [
          { name: "curried", type: Type.number },
          { name: "partial", type: Type.number },
          { name: "composed", type: Type.number },
        ],
      },
    ),
  },
  {
    id: "operators",
    name: "Operators tour",
    document: doc(
      `// Operators are stdlib sugar that desugars to ops:
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
      {
        inputs: [
          { name: "a", type: Type.number, default: 7 },
          { name: "b", type: Type.number, default: 3 },
        ],
        outputs: [
          { name: "sum", type: Type.number },
          { name: "inRange", type: Type.boolean },
          { name: "notZero", type: Type.boolean },
          { name: "winner", type: Type.string },
        ],
      },
    ),
  },
  {
    id: "structs",
    name: "Struct typing (nested)",
    document: doc(
      `// Struct types come from the language definition: field access is checked
// and typed through nested structs. Try misspelling a field ($user.naem)
// to see the unknown_field error.

let name  = $user.name.first
let adult = $user.age >= 18

output label = If(adult, name, "minor")
output adult = adult
output city  = $user.address.city
`,
      {
        types: [
          { name: "Name", fields: { first: Type.string, last: Type.string } },
          { name: "Address", fields: { city: Type.string, zip: Type.string } },
          {
            name: "User",
            fields: { name: Type.name("Name"), age: Type.number, address: Type.name("Address") },
          },
        ],
        inputs: [
          {
            name: "user",
            type: Type.name("User"),
            default: {
              name: { first: "Ada", last: "Lovelace" },
              age: 36,
              address: { city: "London", zip: "N1" },
            },
          },
        ],
        outputs: [
          { name: "label", type: Type.string },
          { name: "adult", type: Type.boolean },
          { name: "city", type: Type.string },
        ],
      },
    ),
  },
  {
    id: "scratch",
    name: "Scratchpad",
    document: doc(
      `// A blank slate with two number inputs ($a, $b).

output out = $a + $b
`,
      {
        inputs: [
          { name: "a", type: Type.number, default: 1 },
          { name: "b", type: Type.number, default: 2 },
        ],
        outputs: [{ name: "out", type: Type.any }],
      },
    ),
  },
];
