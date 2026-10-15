//? Convert: the three conversion rules, decided here rather than inherited from JavaScript, and
// exported so a host op converts the way the language does. `ToString`, `ToNumber` and `ToBool`
// call these, every string op reads its text through `toString`, and the evaluator converts an
// op input declared `convert: true` with them before the op runs (see OpInput).

// What toNumber accepts as text: a plain decimal, with an optional sign, fraction and exponent.
// `Number()` alone would also take "", "0x10" and "Infinity". Anything else is null rather than
// a throw or a 0: null is the language's "no value", and `Default(ToNumber(x), 0)` says the
// fallback aloud.
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export const Convert = {
  /** A value as text: null is "", a primitive is written out, anything else is its JSON. */
  toString(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  },

  /**
   * A value as a number: a boolean is 1 or 0, text is a plain decimal, anything else is null.
   * Text that overflows ("1e999") is no number either: the regex admits it and `Number()`
   * makes an infinity of it, which a converting input or parameter would hand on past every
   * check an op's result gets.
   */
  toNumber(value: unknown): number | null {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!DECIMAL.test(text)) return null;
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  },

  /** A value as a boolean: false for false, 0, "", null and an empty list, else true. */
  toBool(value: unknown): boolean {
    return !(
      value === false ||
      value === 0 ||
      value === "" ||
      value === null ||
      value === undefined ||
      (Array.isArray(value) && value.length === 0)
    );
  },
};
