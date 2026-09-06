import { composeLayers } from "./language/compose";
import { type PortLayer, type Ports, Policy } from "./language/infra/ports";
import { type LanguageDescriptor } from "./language/infra/registry";
import { type Language } from "./language/language";

//? Test helpers. Deliberately NOT re-exported from index.ts, so tsup never pulls them into the
// bundle, and kept out of language/ because everything there is shipping code arranged by layer.
// They give a test the descriptor a program is analysed against once port layers sit on top of
// `lang`, and throw on compose problems so a broken fixture fails loudly at the call site.

export const withLayers = (
  lang: Language,
  global: readonly PortLayer[],
  program: readonly PortLayer[],
): LanguageDescriptor => {
  const composed = composeLayers(lang.descriptor, global, program);
  if (!composed.ok) {
    throw new Error(
      "withLayers: " + composed.problems.map((p) => `${p.where}: ${p.message}`).join("; "),
    );
  }
  return composed.descriptor;
};

/** The common case: one program-level layer of `ports` and nothing global. */
export const withPorts = (lang: Language, ports: Ports): LanguageDescriptor =>
  withLayers(lang, [], [{ id: "test", ports, policy: Policy.user }]);
