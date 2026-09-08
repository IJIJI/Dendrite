---
title: "Lambdas and lists"
description: "Functions as values, and the list ops that take them."
sidebar:
  order: 4
---

`item => item > 10{:den}` is a lambda; `Filter{:den}`, `Map{:den}`, `Reduce{:den}` and their kin are ordinary ops that take one. Closures are real and lexical; recursion is deliberately impossible, so every program terminates. This page will build up from a filter to a fold.
