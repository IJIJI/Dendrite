import { createStdlib } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { signature } from "./ops";

//? The signature the reference prints, as its text and as its colours.

const language = createStdlib();
const html = (name: string): string => signature(language.descriptor.ops.get(name)!, language);
// The text a reader sees: the spans stripped, the one escape the arrow needs undone.
const text = (markup: string): string => markup.replace(/<[^>]+>/g, "").replace(/&gt;/g, ">");
const span = (cls: string, content: string): string => `<span class="tok-${cls}">${content}</span>`;

describe("signature", () => {
  it("writes the op the way Dendrite writes a function type", () => {
    expect(text(html("Join"))).toBe("Join(parts~: string[], separator?: string) -> string");
    expect(text(html("If"))).toBe("If(condition: boolean, then: lazy any, else: lazy any) -> any");
    expect(text(html("And"))).toBe("And(nodes...: lazy boolean) -> boolean");
  });

  it("colours the op, the names, the marks and the types as the editor does", () => {
    const join = html("Join");
    expect(join).toContain(span("op", "Join"));
    expect(join).toContain(span("ident", "parts") + span("punct", "~") + span("punct", ":"));
    expect(join).toContain(span("ident", "separator") + span("symbol", "?") + span("punct", ":"));
    expect(join).toContain(span("type", "string") + span("punct", "[") + span("punct", "]"));
    expect(join).toContain(span("symbol", "-&gt;") + " " + span("type", "string")); // escaped for HTML
  });

  it("marks a lazy input on its type, and the type keeps its colour", () => {
    expect(html("If")).toContain(
      span("ident", "then") +
        span("punct", ":") +
        " " +
        span("keyword", "lazy") +
        " " +
        span("type", "any"),
    );
    expect(html("And")).toContain(span("keyword", "lazy") + " " + span("type", "boolean"));
  });
});
