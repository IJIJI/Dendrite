import { type ProgramInstance, type Snapshot } from "@dendrite-lang/core";

//? Carrying an input's value across a layer change. Values are keyed by name, so to the
// instance a renamed or re-added input is a new one, seeded from its type; the value the
// user typed has to be put back by hand, and only once the name exists. In-process that is
// inside the change; over a wire (a link replica) it is a push later - and a replica refuses
// a name it does not yet know, as core would. So: watch, then change.
//
// The emission to watch is `snapshot`, not `ports`: an instance publishes its layers at the
// START of a recompile, before the runtime holds the new program, so a value set from inside
// that emission reaches a runtime that does not know the name yet. The snapshot is published
// once the recompile is done - and only for the persisted layer, which is the one a user
// edits. One shot, settled by whichever comes first: the snapshot (carry if it declares the
// name), or a `refused` diagnostic (the change moved nothing; give up).

const declaresInput = (snapshot: Snapshot, name: string): boolean =>
  snapshot.program.ports?.inputs.some((input) => input.name === name) ?? false;

/** Run `change`, then set `name` to `value` once the change is published. */
export function carryValue(
  instance: ProgramInstance,
  name: string,
  value: unknown,
  change: () => void,
): void {
  const settle = (): void => {
    for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  };
  const subscriptions = [
    instance.snapshot.subscribe((snapshot) => {
      settle();
      if (declaresInput(snapshot, name)) instance.setInput(name, value);
    }),
    instance.diagnostics.subscribe((diagnostics) => {
      if (diagnostics.some((d) => d.refused)) settle();
    }),
  ];
  change();
}
