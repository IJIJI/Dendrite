---
title: "The standard library"
description: "What `stdlib` is, how its ops are grouped, and how a host picks the parts it wants."
sidebar:
  order: 1
---

The standard library is a language: primitive types, the ops every host has, and the operators that are sugar over them. Its ops come in segments - logic, comparison, control, array, arithmetic, list - and a host will be able to take the segments it wants and leave the rest. The pages beside this one are generated from the language itself, one per segment, so they cannot drift. This page will explain the conventions the ops share: variadic inputs, `any`, higher-order ops with a function-typed input.
