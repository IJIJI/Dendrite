import { type Language, type OpDefinition } from "@dendrite-lang/core";
import { partsHtml, signatureParts } from "@dendrite-lang/editor";

//? The signature OpsReference.astro prints for an op, kept out of the component so it can be
// tested (ops.test.ts). The parts are the editor's own (`signatureParts`), the ones its hover
// shows, coloured by its own highlighter, so the reference and the hover cannot disagree; this
// only renders them as HTML.
export function signature(op: OpDefinition, language: Language): string {
  return partsHtml(signatureParts(op, language));
}
