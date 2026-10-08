//? A ```den fence's own words, which mdast hands over as `node.meta`, separate from
// `node.lang`. One parser, because two readers act on the same words: remark-den.ts styles
// the block, and content.test.ts decides what the sample has to prove. If they disagreed, a
// fence could wear a warning edge that nothing asserts, or the other way round.
//
//   ```den                       an ordinary sample: it must compile
//   ```den fails                 it is here to SHOW a diagnostic: it must NOT compile
//   ```den warns                 it is here to show a WARNING: it compiles, and it must warn
//   ```den inputs="score:number" it declares its inputs, for when the type is the point
//                                (the default is `any` per `$name`, which would swallow
//                                the very error a type sample means to show)

export interface DenMeta {
  /** The sample is on the page to show a diagnostic. */
  fails: boolean;
  /** The sample is on the page to show a warning; every other sample must be warning-free. */
  warns: boolean;
  /** The inputs it declares, `"score:number, bonus:number"`, if it declares any. */
  inputs?: string;
}

export function parseDenMeta(meta: string | null | undefined): DenMeta {
  const words = (meta ?? "").trim();
  return {
    fails: words.split(/\s+/).includes("fails"),
    warns: words.split(/\s+/).includes("warns"),
    inputs: /inputs="([^"]*)"/.exec(words)?.[1],
  };
}

/**
 * What a sample that is there to show a diagnostic wears, and says: the class of its coloured
 * edge, and a status tag with the words, because a colour alone says nothing. One definition
 * for the two things that draw such a sample, a ```den fence (remark-den.ts) and a live block
 * (Live.tsx). The tag's classes are the editor's own status tag.
 */
export interface SampleEdge {
  className: string;
  tagClassName: string;
  label: string;
}

export function sampleEdge(sample: { fails?: boolean; warns?: boolean }): SampleEdge | undefined {
  if (sample.fails)
    return {
      className: "dendrite-fails",
      tagClassName: "dendrite-sample-tag dendrite-tag dendrite-tag-error",
      label: "does not compile",
    };
  if (sample.warns)
    return {
      className: "dendrite-warns",
      tagClassName: "dendrite-sample-tag dendrite-tag dendrite-tag-warning",
      label: "compiles with a warning",
    };
  return undefined;
}
