import { createStdlib } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { styledRanges, type TokenClass } from "./tokens";

// The highlighter's classes, read back as `text:class` pairs so a test says what a reader sees.
const language = createStdlib();
const classes = (source: string): string[] =>
  styledRanges(source, language).map(({ from, to, cls }) => `${source.slice(from, to)}:${cls}`);
const classOf = (source: string, text: string): TokenClass | undefined =>
  styledRanges(source, language).find(({ from, to }) => source.slice(from, to) === text)?.cls;

describe("the type colour", () => {
  it("colours a parameter's annotation", () => {
    expect(classOf("let double = (n: number) => n * 2", "number")).toBe("type");
  });

  it("colours a binding's annotation, by the same rule", () => {
    expect(classOf("let rows: number[] = []", "number")).toBe("type");
  });

  it("reads a signature's marks (`...`, `?`, `~`) as plain text, and the type after them", () => {
    // The reference prints `parts~: string[]`; `~` and `?` are no token of the language, so the
    // lexer skips them and they stay uncoloured, and the type after the colon is still a type.
    expect(classOf("Join(parts~: string[], separator?: string) -> string", "string")).toBe("type");
    expect(classes("Join(parts~: string[])")).not.toContainEqual(expect.stringContaining("~"));
  });

  it("colours a cast: `as` as a keyword, its target as a type", () => {
    expect(classes("output x = $rows as number[]")).toEqual([
      "output:keyword",
      "x:ident",
      "=:punct",
      "$:input",
      "rows:input",
      "as:keyword",
      "number:type",
      "[:punct",
      "]:punct",
    ]);
    // `as` is a keyword only by its text, so a binding of that name reads the same way: the
    // highlighter has no parser, and this is the same ceiling as a binding named `number`.
    expect(classOf("let as = 1", "as")).toBe("keyword");
  });

  it("colours a signature's return type, after ->", () => {
    expect(classes("Add(nodes...: number) -> number")).toEqual([
      "Add:op",
      "(:punct",
      "nodes:ident",
      ".:punct",
      ".:punct",
      ".:punct",
      "::punct",
      "number:type",
      "):punct",
      "->:operator",
      "number:type",
    ]);
  });

  it("colours the parameters of a function type, inside the group before ->", () => {
    const source = "Filter(list: any[], predicate: (any) -> boolean) -> any[]";
    expect(classes(source).filter((pair) => pair.endsWith(":type"))).toEqual([
      "any:type",
      "any:type",
      "boolean:type",
      "any:type",
    ]);
    // A parameter's NAME in that group is not a type, whatever group it sits in.
    expect(classOf(source, "predicate")).toBe("ident");
  });

  it("colours a type written on its own, as the docs do in prose", () => {
    expect(classes("number")).toEqual(["number:type"]);
    expect(classes("number[]")).toEqual(["number:type", "[:punct", "]:punct"]);
    expect(classes("(number) -> boolean")).toEqual([
      "(:punct",
      "number:type",
      "):punct",
      "->:operator",
      "boolean:type",
    ]);
  });

  it("leaves a binding that shares a type's name an identifier", () => {
    expect(classes("let number = 5\noutput x = number")).toEqual([
      "let:keyword",
      "number:ident",
      "=:punct",
      "5:number",
      "output:keyword",
      "x:ident",
      "=:punct",
      "number:ident",
    ]);
  });

  it("leaves a named argument's value alone when it is not a type's name", () => {
    expect(classOf("output x = If(condition: true, then: 1)", "true")).toBe("literal");
    expect(classOf("output x = If(condition: ok, then: 1)", "ok")).toBe("ident");
  });

  it("known ceiling: a binding named like a type, passed by name, is coloured as the type", () => {
    // A named argument's `:` and an annotation's `:` are the same token; only the parser can
    // tell them apart. Pinned here so that fixing it is a visible change, not a silent one.
    expect(classOf("let number = 5\noutput x = If(condition: true, then: number)", "number")).toBe(
      "ident",
    ); // the first `number`, the binding itself
    const source = "output x = If(condition: true, then: number)";
    expect(classOf(source, "number")).toBe("type");
  });

  it("does not treat null, a literal, as a type", () => {
    expect(classOf("(x: null) => x", "null")).toBe("literal");
  });
});
