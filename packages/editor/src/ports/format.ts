//? One rule for showing a runtime value as text, shared by every pane (read-only inputs,
// outputs) so no two panes can disagree. JSON for data; explicit markers for the values
// JSON.stringify has no text for (functions, undefined).

/** `indent` > 0 pretty-prints objects/arrays (for multi-line display); 0 keeps one line. */
export function formatValue(value: unknown, indent = 0): string {
  if (typeof value === "function") return "ƒ (function value)";
  if (value === undefined) return "undefined";
  return JSON.stringify(value, null, indent || undefined) ?? String(value);
}
