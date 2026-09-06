import { describe, expect, it, vi } from "vitest";

import { createSubject } from "./observable";

describe("createSubject", () => {
  it("holds the initial value and reports changes to subscribers", () => {
    const subject = createSubject(1);
    const seen: number[] = [];
    subject.subscribe((v) => seen.push(v));

    expect(subject.get()).toBe(1);
    subject.set(2);
    subject.set(3);
    expect(subject.get()).toBe(3);
    expect(seen).toEqual([2, 3]);
  });

  it("does not notify when the value is unchanged (Object.is)", () => {
    const subject = createSubject("a");
    const listener = vi.fn();
    subject.subscribe(listener);
    subject.set("a");
    expect(listener).not.toHaveBeenCalled();
  });

  it("subscribe does not replay the current value - it reports changes only", () => {
    const subject = createSubject(42);
    const listener = vi.fn();
    subject.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function", () => {
    const subject = createSubject(0);
    const listener = vi.fn();
    const unsubscribe = subject.subscribe(listener);
    subject.set(1);
    unsubscribe();
    subject.set(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("tolerates a listener unsubscribing another during an emit", () => {
    const subject = createSubject(0);
    const second = vi.fn();
    let unsubscribeSecond = (): void => {};
    subject.subscribe(() => unsubscribeSecond());
    unsubscribeSecond = subject.subscribe(second);

    subject.set(1); // the snapshot still delivers this emit to `second`
    subject.set(2); // but not the next one
    expect(second).toHaveBeenCalledTimes(1);
  });
});
