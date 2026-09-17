import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

//? Every TypeScript sample the site shows, typechecked against the packages' SOURCE, so a
// rename in core, the editor or the link cannot leave a documented snippet quietly wrong -
// which is how the editor README came to import a `defaultEnd` that had been renamed
// `defaultActions`. The sibling content.test.ts does this for the ```den samples.
//
// A page's fences are ONE script, because that is what the pages already are: Installation
// imports in its first fence and uses `runtime` in its second. So they are concatenated in
// order into one virtual file per page, on top of:
//   - src/examples/host/prelude.ts, standing in for what the host brings (`save`, `element`);
//   - the page named by a `continues="..."` tag, for a page that picks up where another left
//     off, so it borrows that page's real code instead of a re-declared copy of it.
// Two tags step out of that. `sketch` is not TypeScript at all - a shape, an outline - and is
// skipped. `alone` is its own script: the link page shows a server and a browser, which
// import the same names and are never one file.
//
// One program holds every script: the alternative parses core and editor source once each.

const here = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(here, "../..");
const docsDir = path.join(here, "docs");
const preludePath = path.join(docsRoot, "src/examples/host/prelude.ts");
const ambientPath = path.join(docsRoot, "src/examples/host/ambient.d.ts");

// ── the fences ─────────────────────────────────────────────────────────────────

const FENCE = /^```(tsx?)([^\n]*)\n([\s\S]*?)^```/gm;

interface TsMeta {
  /** Not TypeScript: a shape or an outline, here to be read rather than compiled. */
  sketch: boolean;
  /** Its own script, not part of the page's: another runtime, or another program. */
  alone: boolean;
  /** The page this one continues, relative to it: `installation`, `../installation`. */
  continues?: string;
}

function parseTsMeta(meta: string | null | undefined): TsMeta {
  const text = (meta ?? "").trim();
  const words = text.split(/\s+/);
  return {
    sketch: words.includes("sketch"),
    alone: words.includes("alone"),
    continues: /continues="([^"]*)"/.exec(text)?.[1],
  };
}

interface Fence {
  /** 1-based line in the page where the fence's first line of code sits. */
  line: number;
  code: string;
}

/** One script: a page's fences together, or a single `alone` fence. */
interface Unit {
  /** `host/installation.md`, or `host/packages/link.md fence 1` for an `alone` one. */
  label: string;
  /** The page the fences live on. */
  file: string;
  fences: Fence[];
  /** True if any fence in it is `tsx`: the whole script then has to allow JSX. */
  jsx: boolean;
  /** The page it continues, resolved to that page's `file`. */
  continues?: string;
}

async function contentFiles(): Promise<string[]> {
  const entries = await readdir(docsDir, { recursive: true });
  return entries
    .map((entry) => entry.split(path.sep).join("/"))
    .filter((entry) => entry.endsWith(".md") || entry.endsWith(".mdx"))
    .sort();
}

/** `installation`, on `host/embedding-core.md`, is `host/installation.md`. */
function resolveContinues(from: string, target: string, known: Set<string>): string {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), target));
  for (const candidate of [`${base}.md`, `${base}.mdx`]) {
    if (known.has(candidate)) return candidate;
  }
  throw new Error(`${from}: continues="${target}", which is not a page`);
}

async function tsUnits(): Promise<Unit[]> {
  const files = await contentFiles();
  const known = new Set(files);
  const units: Unit[] = [];
  for (const file of files) {
    const text = await readFile(path.join(docsDir, file), "utf8");
    const page: Unit = { label: file, file, fences: [], jsx: false };
    const alone: Unit[] = [];
    let index = 0;
    for (const match of text.matchAll(FENCE)) {
      index += 1;
      const meta = parseTsMeta(match[2]);
      if (meta.sketch) continue;
      const fence: Fence = {
        line: text.slice(0, match.index).split("\n").length + 1,
        code: match[3] ?? "",
      };
      const jsx = match[1] === "tsx";
      const continues = meta.continues ? resolveContinues(file, meta.continues, known) : undefined;
      if (meta.alone) {
        alone.push({ label: `${file} fence ${index}`, file, fences: [fence], jsx, continues });
        continue;
      }
      page.jsx ||= jsx;
      if (continues) page.continues = continues;
      page.fences.push(fence);
    }
    if (page.fences.length > 0) units.push(page);
    units.push(...alone);
  }
  return units;
}

// ── the virtual files ──────────────────────────────────────────────────────────

/** Where a stretch of a virtual file came from: which file, and from which of its lines. */
interface Segment {
  /** 1-based first line of this stretch in the virtual file. */
  from: number;
  label: string;
  /** 1-based line of `label` that this stretch starts at. */
  sourceLine: number;
}

interface Virtual {
  path: string;
  text: string;
  segments: Segment[];
}

function countLines(text: string): number {
  return text.split("\n").length - 1;
}

const prelude = await readFile(preludePath, "utf8");
const units = await tsUnits();
// What a `continues=` reaches is a page's own script, never one of its `alone` fences.
const pageScripts = new Map(
  units.filter((unit) => unit.label === unit.file).map((unit) => [unit.file, unit]),
);

/** One unit as a single script: the prelude, what it continues, then its own fences. */
function assemble(unit: Unit): Virtual {
  const parts: { label: string; sourceLine: number; text: string }[] = [
    { label: "src/examples/host/prelude.ts", sourceLine: 1, text: prelude },
  ];

  const seen = new Set<string>();
  for (let next = unit.continues; next; ) {
    if (seen.has(next)) throw new Error(`${unit.label}: its continues= chain loops at ${next}`);
    seen.add(next);
    const parent = pageScripts.get(next);
    if (!parent) throw new Error(`${unit.label}: continues="${next}", which has no TypeScript`);
    for (const fence of parent.fences) {
      parts.push({ label: parent.file, sourceLine: fence.line, text: fence.code });
    }
    next = parent.continues;
  }

  for (const fence of unit.fences) {
    parts.push({ label: unit.file, sourceLine: fence.line, text: fence.code });
  }

  const segments: Segment[] = [];
  let text = "";
  let line = 1;
  for (const part of parts) {
    const body = part.text.endsWith("\n") ? part.text : `${part.text}\n`;
    segments.push({ from: line, label: part.label, sourceLine: part.sourceLine });
    text += body;
    line += countLines(body);
  }

  const name = unit.label.replace(/\.(md|mdx)/, "").replace(/[^A-Za-z0-9]+/g, "_");
  const file = `src/content/.samples/${name}.${unit.jsx ? "tsx" : "ts"}`;
  return { path: path.join(docsRoot, file), text, segments };
}

const virtuals = new Map(units.map((unit) => [unit.label, assemble(unit)]));

/** A virtual file's line, said in terms of the page a reader would open. */
function locate(virtual: Virtual, line: number): string {
  const segment = [...virtual.segments].reverse().find((candidate) => line >= candidate.from);
  if (!segment) return `line ${line}`;
  return `${segment.label}:${segment.sourceLine + (line - segment.from)}`;
}

// ── one program over all of them ───────────────────────────────────────────────

function compilerOptions(): ts.CompilerOptions {
  const configPath = path.join(docsRoot, "tsconfig.json");
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) {
    throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, "\n"));
  }
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, docsRoot, undefined, configPath);
  // Those paths are what makes this test bite: they point core, the editor and the link at
  // package SOURCE, so a rename fails here with no build step in between.
  return { ...parsed.options, noEmit: true };
}

const options = compilerOptions();
const key = (file: string): string => path.normalize(file).toLowerCase();
const overlay = new Map([...virtuals.values()].map((virtual) => [key(virtual.path), virtual]));

const base = ts.createCompilerHost(options, true);
const host: ts.CompilerHost = {
  ...base,
  fileExists: (file) => overlay.has(key(file)) || base.fileExists(file),
  readFile: (file) => overlay.get(key(file))?.text ?? base.readFile(file),
  getSourceFile: (file, languageVersion, onError, shouldCreate) => {
    const virtual = overlay.get(key(file));
    if (!virtual) return base.getSourceFile(file, languageVersion, onError, shouldCreate);
    return ts.createSourceFile(
      file,
      virtual.text,
      languageVersion,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
  },
};

const program = ts.createProgram({
  rootNames: [...overlay.values()].map((virtual) => virtual.path).concat(ambientPath),
  options,
  host,
});

/** Every complaint about one script, each pointed at the line a reader would look at. */
function problemsIn(virtual: Virtual): string[] {
  const source = program.getSourceFile(virtual.path);
  if (!source) throw new Error(`${virtual.path}: the program does not hold it`);
  const diagnostics = [
    ...program.getSyntacticDiagnostics(source),
    ...program.getSemanticDiagnostics(source),
  ];
  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (diagnostic.start === undefined) return `TS${diagnostic.code}: ${message}`;
    const { line } = source.getLineAndCharacterOfPosition(diagnostic.start);
    return `${locate(virtual, line + 1)}: TS${diagnostic.code}: ${message}`;
  });
}

describe("the TypeScript samples in the pages", () => {
  it("finds fences to check", () => {
    expect(units.length).toBeGreaterThan(0);
  });

  it.for(units.map((unit) => [unit.label, unit] as const))("%s", ([, unit]) => {
    expect(problemsIn(virtuals.get(unit.label)!)).toEqual([]);
  });
});
