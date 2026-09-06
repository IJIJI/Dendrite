import { type Observable } from "@dendrite-lang/core";

//? The reactive primitive itself lives in core (`language/infra/observable.ts`), because a
// ProgramInstance publishes through it. It is re-exported here so editor code and editor
// hosts keep importing it from one place, alongside `watch`, which is a rendering
// convenience with no business in core.

export { createSubject, type Observable, type Subject } from "@dendrite-lang/core";

/**
 * Render the current value now and again on every change; returns the unsubscribe.
 */
export function watch<T>(observable: Observable<T>, render: (value: T) => void): () => void {
  render(observable.get());
  return observable.subscribe(render);
}
