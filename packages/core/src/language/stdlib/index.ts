import { createLanguage, extendLanguage, type Language } from "../language";
import { installArithmetic } from "./arithmetic";
import { installArray } from "./array";
import { installControl } from "./control";
import { installConversion } from "./conversion";
import { installList } from "./list";
import { installLogic } from "./logic";
import { installString } from "./string";

// The segments, one file each, in the order of the reference pages: the descriptor keeps
// registration order, and the reference is generated from it. This is the one list of their
// names; the type below is read from it.
const SEGMENTS = {
  logic: installLogic,
  control: installControl,
  array: installArray,
  arithmetic: installArithmetic,
  list: installList,
  conversion: installConversion,
  string: installString,
} as const;

/** A part of the standard library a host can take on its own, with `createStdlib({ segments })`. */
export type StdlibSegment = keyof typeof SEGMENTS;

const SEGMENT_NAMES = Object.keys(SEGMENTS) as StdlibSegment[];

/**
 * Creates the standard-library language: the logic, control, array, arithmetic, list,
 * conversion and string segments, each with its ops, their evaluators and the symbols that
 * are sugar over them. Built on the createLanguage() base (which provides the primitive
 * types). No host-specific knowledge - safe to use standalone.
 *
 * `segments` takes part of it: `createStdlib({ segments: ["logic", "arithmetic"] })`. Every
 * segment stands alone, and a symbol comes with the segment that owns its op, so a language
 * without `arithmetic` has no `+` and no `-14`, and one without `string` has no template.
 * They install in the library's own order, whatever order the list is in.
 */
export function createStdlib(options: { segments?: readonly StdlibSegment[] } = {}): Language {
  const chosen = new Set(options.segments ?? SEGMENT_NAMES);
  // A typed caller cannot get here; a JavaScript one can, and so can a name read from a config.
  for (const name of chosen) {
    if (!SEGMENT_NAMES.includes(name)) {
      throw new Error(
        `createStdlib: unknown segment '${name}'; the segments are ${SEGMENT_NAMES.join(", ")}`,
      );
    }
  }

  const lang = createLanguage();
  for (const name of SEGMENT_NAMES) if (chosen.has(name)) SEGMENTS[name](lang);
  return lang;
}

/**
 * Extend a language with the core language as its base.
 * Shorthand for extendLanguage(extension, createStdlib()).
 * Extension definitions take precedence over core on key conflicts.
 */
export function extendStdlib(extension: Language): Language {
  return extendLanguage(extension, createStdlib());
}
