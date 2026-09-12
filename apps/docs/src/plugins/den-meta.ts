//? A ```den fence's own words, which mdast hands over as `node.meta`, separate from
// `node.lang`. One parser, because two readers act on the same words: remark-den.ts styles
// the block, and content.test.ts decides what the sample has to prove. If they disagreed, a
// fence could wear a warning edge that nothing asserts, or the other way round.
//
//   ```den                       an ordinary sample: it must compile
//   ```den fails                 it is here to SHOW a diagnostic: it must NOT compile
//   ```den inputs="score:number" it declares its inputs, for when the type is the point
//                                (the default is `any` per `$name`, which would swallow
//                                the very error a type sample means to show)

export interface DenMeta {
  /** The sample is on the page to show a diagnostic. */
  fails: boolean;
  /** The inputs it declares, `"score:number, bonus:number"`, if it declares any. */
  inputs?: string;
}

export function parseDenMeta(meta: string | null | undefined): DenMeta {
  const words = (meta ?? "").trim();
  return {
    fails: words.split(/\s+/).includes("fails"),
    inputs: /inputs="([^"]*)"/.exec(words)?.[1],
  };
}
