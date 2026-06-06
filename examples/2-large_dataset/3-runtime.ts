/**
 * Core language using Runtime.
 *
 * The computation is split across two programs by dependency boundary:
 *   'filtering'  dependsOn: values, threshold  →  passing, anyPassed
 *   'honors'     dependsOn: values only         →  anyCumLaude
 *
 * When only threshold changes (scenarios 5→6→7, 8→9), the Runtime's inputIndex
 * routes the change to 'filtering' only, 'honors' is not evaluated at all.
 * Compare timing against core.run.example and core.runner.example.
 */

import { createRuntime } from "../../src/language/runtime";
import {
  descriptor,
  filteringProgram,
  honorsProgram,
  scenarios,
  changesFrom,
  delta,
  displayRuntime,
  timed,
  logHeader,
  type Scenario,
} from "./shared";

const runtime = createRuntime(descriptor);
const filtering = timed("register filtering", () =>
  runtime.register("filtering", filteringProgram),
);
const honors = timed("register honors", () =>
  runtime.register("honors", honorsProgram),
);

let prev: Scenario | undefined;
let lastHonors = honors.initialOutputs;

for (const s of scenarios) {
  const changes = delta(prev, s);
  const what = changesFrom(prev, s);
  const note = what === "threshold only" ? `${what} — honors skipped` : what;

  logHeader(s, note);
  const results = timed("updateInputs()", () => runtime.updateInputs(changes));
  if (results.has("honors")) lastHonors = results.get("honors")!;
  displayRuntime(results, lastHonors);
  prev = s;
}

filtering.unregister();
honors.unregister();
