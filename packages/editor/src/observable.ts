//? Minimal Observer: a current value plus subscribers. The editor's only reactive
// primitive - the session publishes through subjects, panes (vanilla now, React later)
// subscribe. `subscribe` reports CHANGES only; read the current value with `get()`. That is
// the external-store contract React's useSyncExternalStore expects, so Phase 2 binds these
// directly without an adapter.

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
