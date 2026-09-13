import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AnalysisError,
  createEnvironment,
  createStdlib,
  Policy,
  type PortLayer,
  type Ports,
  Type,
} from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { examples } from "../examples";
import { parseDenMeta } from "../plugins/den-meta";

//? Every Dendrite sample the site shows, loaded through the real pipeline, so a sample
// cannot rot when the language changes - the standing rule from `.docs/todo.md`, "every code
// sample compiled by a test". Two kinds of sample: a ```den fence in a page, and a whole
// program in src/examples (what the live blocks mount). Plus one check that every internal
// link on a page points at a page that exists.
//
// A fence is checked through parse + ANALYSE, never through compile() or load(): those
// return ok:true whenever no *required* output was lost and drop the error list on that arm,
// so a fence with a type error would sail through them.

const here = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.join(here, "docs");

// ── the samples ────────────────────────────────────────────────────────────────

const env = createEnvironment(createStdlib());

/** The pipeline a sample is checked against: the stdlib plus the ports the sample needs. */
function pipelineFor(ports: Ports, label: string) {
  const layer: PortLayer = { id: "sample", ports, policy: Policy.user };
  const composed = env.forProgram([], [layer]);
  if (!composed.ok) {
    throw new Error(
      `${label}: its ports do not compose - ${composed.problems.map((p) => p.message).join("; ")}`,
    );
  }
  return composed.environment;
}

/** Parse then analyse, and report every error either stage found. */
function errorsIn(source: string, ports: Ports, label: string): string[] {
  const pipeline = pipelineFor(ports, label);
  const parsed = pipeline.parse(source);
  if (!parsed.ok) return parsed.errors.map((e) => `${e.kind}: ${e.message}`);
  const analysed = pipeline.analyse(parsed.program);
  return analysed.errors.map((e: AnalysisError) => `${e.kind}: ${e.message}`);
}

/** `number`, `string[]`, `any` - what an `inputs="…"` tag may name. */
function typeFromLabel(label: string): Type {
  const name = label.trim();
  return name.endsWith("[]") ? Type.array(typeFromLabel(name.slice(0, -2))) : Type.name(name);
}

const INPUT_REF = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
const OUTPUT_DECL = /^\s*output\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
/**
 * The ports a fence needs, derived from the fence itself: every `$name` it reads and every
 * `output` it declares, each typed `any` so the sample carries no contract of its own. A
 * fence whose point IS a type declares them instead, with `inputs="score:number"` - `any`
 * accepts anything, and would swallow the very error such a sample means to show.
 */
function portsFor(source: string, declared: string | undefined): Ports {
  const inputs = declared
    ? declared
        .split(",")
        .filter((entry) => entry.trim())
        .map((entry) => {
          const [name, label = "any"] = entry.split(":");
          return { name: name!.trim(), type: typeFromLabel(label) };
        })
    : [...new Set([...source.matchAll(INPUT_REF)].map((m) => m[1]!))].map((name) => ({
        name,
        type: Type.any,
      }));
  const outputs = [...new Set([...source.matchAll(OUTPUT_DECL)].map((m) => m[1]!))].map((name) => ({
    name,
    type: Type.any,
  }));
  return { inputs, outputs };
}

interface Sample {
  label: string;
  source: string;
  ports: Ports;
  /** The sample is meant NOT to compile - it shows a diagnostic. */
  fails: boolean;
}

const FENCE = /^```den([^\n]*)\n([\s\S]*?)^```/gm;

async function contentFiles(): Promise<string[]> {
  const entries = await readdir(docsDir, { recursive: true });
  return entries.filter((e) => e.endsWith(".md") || e.endsWith(".mdx")).sort();
}

async function fenceSamples(): Promise<Sample[]> {
  const samples: Sample[] = [];
  for (const file of await contentFiles()) {
    const text = await readFile(path.join(docsDir, file), "utf8");
    let index = 0;
    for (const match of text.matchAll(FENCE)) {
      const meta = parseDenMeta(match[1]);
      const source = match[2] ?? "";
      index += 1;
      samples.push({
        label: `${file} fence ${index}`,
        source,
        ports: portsFor(source, meta.inputs),
        fails: meta.fails,
      });
    }
  }
  return samples;
}

const fences = await fenceSamples();

describe("the Dendrite samples in the pages", () => {
  it("finds fences to check", () => {
    expect(fences.length).toBeGreaterThan(0);
  });

  it.for(fences.map((s) => [s.label, s] as const))("%s", ([, sample]) => {
    const errors = errorsIn(sample.source, sample.ports, sample.label);
    if (sample.fails) {
      // Tagged ```den fails: it is on the page to show a diagnostic, so it must produce one.
      expect(errors, "a `fails` sample that compiles is no longer showing anything").not.toEqual(
        [],
      );
    } else {
      expect(errors).toEqual([]);
    }
  });
});

describe("the programs the live blocks mount", () => {
  it.for(Object.entries(examples))("%s", ([name, example]) => {
    expect(errorsIn(example.source, example.ports, name)).toEqual([]);
  });
});

// ── the links ──────────────────────────────────────────────────────────────────

/** `learn/getting-started.md` → `/learn/getting-started`, `index.mdx` → `/`. */
function pagePath(file: string): string {
  const withoutExt = file.replace(/\\/g, "/").replace(/\.(md|mdx)$/, "");
  const slug = withoutExt.replace(/(^|\/)index$/, "");
  return `/${slug}`.replace(/\/$/, "") || "/";
}

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;

describe("the links between pages", async () => {
  const files = await contentFiles();
  const known = new Set(files.map(pagePath));
  const pages = await Promise.all(
    files.map(async (file) => ({ file, text: await readFile(path.join(docsDir, file), "utf8") })),
  );

  it.for(pages.map((p) => [p.file, p] as const))("%s", ([, page]) => {
    const from = pagePath(page.file);
    const dir = from === "/" ? "/" : `${from}/`;
    for (const [, href] of page.text.matchAll(LINK)) {
      if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
      // Astro does not prefix a Markdown link with the site's base, so an absolute one
      // breaks the moment the site is served under /Dendrite/.
      expect(href.startsWith("/"), `${page.file}: "${href}" must be relative, not absolute`).toBe(
        false,
      );
      const target = path.posix.resolve(dir, href.split("#")[0]!).replace(/\/$/, "") || "/";
      expect(known, `${page.file}: "${href}" points at ${target}, which is not a page`).toContain(
        target,
      );
    }
  });
});
