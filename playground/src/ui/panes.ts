import { type WidgetSpec } from "../lang/input-widgets";
import { type Diagnostic } from "../lang/session";

//? Vanilla-DOM pane renderers. Deliberately throwaway (the framework-free logic lives in
// ../lang); a future React shell replaces this file only.

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

// ── Inputs ───────────────────────────────────────────────────────────────────

export function renderInputs(
  container: HTMLElement,
  widgets: WidgetSpec[],
  getValue: (name: string) => unknown,
  onChange: (name: string, value: unknown) => void,
): void {
  container.replaceChildren();
  if (widgets.length === 0) {
    container.append(el("p", "empty", "This example registers no inputs."));
    return;
  }

  for (const widget of widgets) {
    const row = el("div", "input-row");
    const label = el("label", "input-label");
    label.append(
      el("span", "input-name", `$${widget.name}`),
      el("code", "input-type", widget.typeLabel),
    );
    row.append(label);

    // The session owns the values (seeded with the same initialValueFor derivation the
    // widget shapes come from) - render its truth, never a local fallback.
    const current = getValue(widget.name);
    switch (widget.control) {
      case "number": {
        const field = el("input");
        field.type = "number";
        field.value = String(current ?? 0);
        field.addEventListener("input", () => {
          // An empty field is "mid-edit", not zero - apply only real numbers.
          if (field.value.trim() === "") return;
          const n = Number(field.value);
          if (!Number.isNaN(n)) onChange(widget.name, n);
        });
        row.append(field);
        break;
      }
      case "boolean": {
        const field = el("input");
        field.type = "checkbox";
        field.checked = Boolean(current);
        field.addEventListener("change", () => onChange(widget.name, field.checked));
        row.append(field);
        break;
      }
      case "text": {
        const field = el("input");
        field.type = "text";
        field.value = String(current ?? "");
        field.addEventListener("input", () => onChange(widget.name, field.value));
        row.append(field);
        break;
      }
      case "json": {
        const field = el("textarea", "json-input");
        field.rows = 4;
        field.value = JSON.stringify(current, null, 2);
        const error = el("div", "json-error");
        field.addEventListener("input", () => {
          try {
            const value: unknown = JSON.parse(field.value);
            error.textContent = "";
            field.classList.remove("invalid");
            onChange(widget.name, value);
          } catch (e) {
            error.textContent = e instanceof Error ? e.message : String(e);
            field.classList.add("invalid");
          }
        });
        row.append(field, error);
        break;
      }
    }
    container.append(row);
  }
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export function renderOutputs(
  container: HTMLElement,
  outputs: ReadonlyMap<string, unknown> | null,
  runtimeError: string | null,
): void {
  container.replaceChildren();
  if (runtimeError) {
    container.append(el("p", "runtime-error", runtimeError));
    return;
  }
  if (!outputs) {
    container.append(el("p", "empty", "No runnable program - fix the errors below."));
    return;
  }
  if (outputs.size === 0) {
    container.append(el("p", "empty", "The program declares no outputs."));
    return;
  }
  for (const [name, value] of outputs) {
    // Closures/undefined are possible output values but JSON.stringify gives no text for
    // them - show explicit markers instead of a blank cell.
    const text =
      typeof value === "function"
        ? "ƒ (function value)"
        : value === undefined
          ? "undefined"
          : JSON.stringify(value);
    const row = el("div", "output-row");
    row.append(el("span", "output-name", name), el("code", "output-value", text));
    container.append(row);
  }
}

// ── Diagnostics ──────────────────────────────────────────────────────────────

export function renderDiagnostics(
  list: HTMLElement,
  diagnostics: Diagnostic[],
  onJump: (line: number, column: number) => void,
): void {
  list.replaceChildren();
  if (diagnostics.length === 0) {
    list.append(el("li", "empty", "No problems."));
    return;
  }
  // Errors before warnings (stable within each severity) - the session emits in pipeline
  // order, which would otherwise list parse warnings above analysis errors.
  const ordered = [...diagnostics].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );
  for (const d of ordered) {
    const item = el("li", `diag diag-${d.severity}`);
    if (d.line !== undefined) {
      const jump = el("button", "diag-loc", `${d.line}:${d.column ?? 1}`);
      jump.addEventListener("click", () => onJump(d.line!, d.column ?? 1));
      item.append(jump);
    }
    item.append(el("span", "diag-kind", d.kind), el("span", "diag-message", d.message));
    list.append(item);
  }
}
