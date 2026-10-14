//? Thunk: how an op receives an input declared `lazy` (OpInput) - the node unevaluated, read
// through `.value` when and if the op wants it. So `If` reads one branch, `And` stops at the
// first false, and a run error in a branch not taken never happens. The node under it is
// memoised by the evaluator already; the thunk keeps its result as well, so "read at most once"
// holds by construction for a host op that reads twice. A throw is not kept: the next read
// computes again, and throws again. Read it during the call: a thunk kept for later reads a
// traversal that is gone.
export class Thunk<T = unknown> {
  private done = false;
  private result: T | undefined;

  constructor(private readonly compute: () => T) {}

  get value(): T {
    if (!this.done) {
      this.result = this.compute();
      this.done = true;
    }
    return this.result as T;
  }
}
