import { describe, expect, it } from "vitest";

import { createSubject, watch } from "./observable";

// createSubject itself is tested in core (language/infra/observable.test.ts); this covers
// the editor's own addition, and proves the re-export still reaches the real thing.
describe("watch", () => {
  it("renders the current value immediately, then every change, until unsubscribed", () => {
    const subject = createSubject("a");
    const seen: string[] = [];
    const stop = watch(subject, (v) => seen.push(v));
    subject.set("b");
    stop();
    subject.set("c");
    expect(seen).toEqual(["a", "b"]);
  });
});
