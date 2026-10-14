import { type Language, type OpDefinition, typeToString } from "@dendrite-lang/core";
import { sourceHtml } from "@dendrite-lang/editor";

//? The signature OpsReference.astro prints for an op, kept out of the component so it can be
// tested (ops.test.ts). Written the way Dendrite writes a function type and coloured by the
// editor's own highlighter: the op, its parameter names, their types, as the code editor
// shows them.
//
// Assembled per input rather than coloured as one line, because of the lazy mark: `lazy` is
// no word of the language, and in `then: lazy any` the highlighter sees `any` after an
// identifier, not after the colon, so it would lose its type colour. A type coloured on its
// own is always a type (the highlighter's rule for a source that is nothing but one), so each
// type is coloured alone and the mark goes between as a keyword span.
export function signature(op: OpDefinition, language: Language): string {
  const den = (code: string): string => sourceHtml(code, language);
  const inputs = op.inputs.map((input) => {
    // `nodes...` swallows every argument; `separator?` may be left out (`required: false`);
    // `parts~` converts what it is given (`convert: true`). One mark at most on the name: the
    // language refuses the flag on a variadic or an optional input when it composes. The lazy
    // mark sits on the type, so it combines: `nodes...: lazy boolean`.
    const mark = input.variadic ? "..." : input.required === false ? "?" : input.convert ? "~" : "";
    const lazy = input.lazy ? '<span class="tok-keyword">lazy</span> ' : "";
    return den(`${input.name}${mark}: `) + lazy + den(typeToString(input.type));
  });
  return den(`${op.name}(`) + inputs.join(den(", ")) + den(") -> ") + den(typeToString(op.output));
}
