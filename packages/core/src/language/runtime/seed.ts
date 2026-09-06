import { type InputDefinition, type LanguageDescriptor } from "../infra/registry";
import { type Type } from "../infra/types";

//? defaultValueFor: the one rule for what an input holds before anyone sets it, and what a
// trigger resets to. InputDefinition.default → TypeDefinition.default, walking `extends`
// upward → [] for arrays → null. The runner, the runtime and the instance all seed through
// it, so a host declaring a struct default sees it everywhere at once.

export function defaultValueFor(def: InputDefinition, descriptor: LanguageDescriptor): unknown {
  return def.default !== undefined ? def.default : typeDefault(def.type, descriptor);
}

function typeDefault(type: Type, descriptor: LanguageDescriptor): unknown {
  if (type.kind === "array") return [];
  if (type.kind !== "name") return null;
  const seen = new Set<string>(); // cycle guard for malformed extends chains
  let current: string | undefined = type.name;
  while (current && !seen.has(current)) {
    seen.add(current);
    const def = descriptor.types.get(current);
    if (def?.default !== undefined) return def.default;
    current = def?.extends;
  }
  return null;
}
