import { createLanguage, extendLanguage, type Language } from "../language";
import { installArithmetic } from "./arithmetic";
import { installArray } from "./array";
import { installControl } from "./control";
import { installConversion } from "./conversion";
import { installList } from "./list";
import { installLogic } from "./logic";
import { installString } from "./string";

/**
 * Creates the standard-library language: the logic, control, array, arithmetic, list,
 * conversion and string segments, each with its ops, their evaluators and the symbols that
 * are sugar over them. Built on the createLanguage() base (which provides the primitive
 * types). No host-specific knowledge - safe to use standalone.
 */
export function createStdlib(): Language {
  const lang = createLanguage();

  // One file per segment, installed in the order of the reference pages: the descriptor
  // keeps registration order, and the reference is generated from it.
  installLogic(lang);
  installControl(lang);
  installArray(lang);
  installArithmetic(lang);
  installList(lang);
  installConversion(lang);
  installString(lang);

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
