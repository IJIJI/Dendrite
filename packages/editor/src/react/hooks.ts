import { useSyncExternalStore } from "react";

import { type EditorHandle } from "../editor";
import { type Observable } from "../observable";

/** Subscribe a component to an observable; re-renders on change (the external-store contract). */
export function useObservable<T>(observable: Observable<T>): T {
  return useSyncExternalStore(observable.subscribe, observable.get);
}

const keys = new WeakMap<EditorHandle, number>();
let nextKey = 0;

/**
 * A stable React key per mounted editor. Panes with uncontrolled fields key on it so their
 * defaultValues reset when the editor remounts for a new document.
 */
export function editorKey(editor: EditorHandle): number {
  let key = keys.get(editor);
  if (key === undefined) keys.set(editor, (key = ++nextKey));
  return key;
}
