---
title: Evaluation
description: Pull-based, incremental, and what stale means.
sidebar:
  order: 4
---

Outputs pull their values; every node knows which inputs it depends on and recomputes only when one of them changed. When a program stops compiling, the last good one keeps running and everything it produces is marked stale rather than hidden. This page will show the cache at work with a live example.
