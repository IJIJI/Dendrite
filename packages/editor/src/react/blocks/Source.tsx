import { type CSSProperties, type ReactNode } from "react";

import { type Language } from "@dendrite-lang/core";

import { sourceParts } from "../../code/source";
import { cx } from "../cx";

//? <Editor.Source/>: a program shown, not run - highlighted by the editor's lexer, no
// CodeMirror, no <Editor> needed. The same markup and classes a MinimalLayout's code block
// has, so the two are indistinguishable on a page; `children` land in the code's corner
// (an <Editor.Actions/> cluster, or a plain link).

export interface SourceProps {
  code: string;
  /** The language to highlight with; the stdlib by default. */
  language?: Language;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Source({ code, language, children, className, style }: SourceProps) {
  return (
    <div className={cx("dendrite-minimal-layout", className)} style={style}>
      <div className="dendrite-code">
        <pre className="dendrite-source">
          <code>
            {sourceParts(code, language).map((part, i) =>
              part.cls ? (
                <span key={i} className={`tok-${part.cls}`}>
                  {part.text}
                </span>
              ) : (
                part.text
              ),
            )}
          </code>
        </pre>
        {children}
      </div>
    </div>
  );
}
