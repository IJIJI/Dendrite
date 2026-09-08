---
title: "The chain"
description: "From source text to output values, one program carried through every stage."
sidebar:
  order: 1
---

Source text becomes tokens; tokens become a raw program; the analyser turns that into a core program with types resolved and unreachable bindings dropped; port layers compose into the descriptor it is checked against; the evaluator walks the result on demand with a per-node cache. This page will carry one program through every stage - as a block diagram first, then stage by stage - and say what each stage may decide and must leave alone.
