---
title: "Types in practice"
description: "What the checker tells you, and how to read it."
sidebar:
  order: 5
---

Every value has a type and the analyser checks them before anything runs: a number where a boolean was expected is a diagnostic, not a surprise at runtime. This page will show the messages you will meet and what each one means, with `any{:den}` and `null{:den}` explained as you go.

A type error is a diagnostic, not a surprise. This program never runs, and the reason is
named before it would have:

```den fails inputs="score:number"
// $score is a number; And wants booleans.
output ok = And($score, true)
```
