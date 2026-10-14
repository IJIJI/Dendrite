//? The nearest name: what a diagnostic suggests when a name matches nothing. Edit distance
// (case-insensitive, so `length` finds `Length`; a transposition is one edit, so `nmae` finds
// `name`) at most two, at most one for a name of four letters or fewer, and none for a single
// letter, which is one edit from every other. The closest wins; a tie goes to the earlier
// candidate, so the order the caller passes is its order of preference (the ops before the
// bindings, for a call). A name is never its own suggestion.
export function nearest(name: string, candidates: Iterable<string>): string | undefined {
  const limit = name.length <= 1 ? 0 : name.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestDistance = limit + 1;
  for (const candidate of candidates) {
    if (candidate === name) continue;
    const d = distance(name.toLowerCase(), candidate.toLowerCase(), limit);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best;
}

/** The sentence a diagnostic appends: ` Did you mean 'x'?`, or nothing when no name is near. */
export function hint(name: string, candidates: Iterable<string>): string {
  const found = nearest(name, candidates);
  return found === undefined ? "" : ` Did you mean '${found}'?`;
}

// Edit distance with a transposition as one edit (optimal string alignment), capped: anything
// over `limit` reads as `limit + 1`, and a length gap over the limit is answered without the
// table.
function distance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let before = Array.from({ length: b.length + 1 }, (_, j) => j); // the row two back
  let previous = before;
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], before[j - 2] + 1);
      }
    }
    before = previous;
    previous = current;
  }
  return Math.min(previous[b.length], limit + 1);
}
