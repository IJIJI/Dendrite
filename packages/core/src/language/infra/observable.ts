//? Minimal Observer: a current value plus its subscribers. The one reactive primitive core
// publishes through - a program instance exposes its diagnostics, ports, outputs, values and
// snapshot as these, and a host or an editor subscribes. `subscribe` reports CHANGES only;
// read the current value with `get()`. That is exactly the external-store contract React's
// useSyncExternalStore expects, so a React binding needs no adapter.
//
// Core stays timer-free: nothing here debounces or batches. A consumer that wants either
// (the editor debounces its snapshot) does it on its own side of the subscription.

export interface Observable<T> {
  get(): T;
  /** Listen for changes. Returns the unsubscribe function. */
  subscribe(listener: (value: T) => void): () => void;
}

export interface Subject<T> extends Observable<T> {
  set(value: T): void;
}

export function createSubject<T>(initial: T): Subject<T> {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    set(value) {
      if (Object.is(value, current)) return;
      current = value;
      // Iterate a snapshot: a listener may unsubscribe (itself or another) mid-emit.
      for (const listener of [...listeners]) listener(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
