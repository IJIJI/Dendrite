---
title: "Bindings and outputs"
description: "let, output, and why there is no sequencing."
sidebar:
  order: 1
---

A program is a set of `let` bindings and `output`s. A binding is a name for a value, computed once per evaluation; an output is what leaves the program. Order does not matter and nothing mutates. This page will start from one output and grow to a small graph of bindings, each step live.
