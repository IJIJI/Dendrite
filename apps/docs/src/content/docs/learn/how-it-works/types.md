---
title: "The type system"
description: "Named and structural types, any, null, extends, function variance."
sidebar:
  order: 2
---

Only named types are registered; arrays and functions are structural. `any` accepts any data value but never a function - the guard that keeps every program total. `null` flows anywhere data is expected. A type may `extend` another; a function's parameters are checked contravariantly. This page will make each rule concrete.
