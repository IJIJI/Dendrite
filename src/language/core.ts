import { z } from 'zod'
import { createLanguage, type Language } from './registry'


/**
 * Creates the base language with primitive types, logical ops,
 * and general-purpose higher-order list ops.
 * No host-specific knowledge - safe to use standalone.
 */
export function createCoreLanguage(): Language {
  const lang = createLanguage()
 
  //? Primitive types 
  lang.registerType('boolean', z.boolean())
  lang.registerType('number', z.number())
  lang.registerType('string', z.string())
  lang.registerType('any', z.unknown())
 
  //? Logic ops
  lang.registerOp({
    name: 'And',
    inputs: [{ name: 'nodes', type: 'boolean', variadic: true }],
    output: 'boolean',
    category: 'logic',
  })
 
  lang.registerOp({
    name: 'Or',
    inputs: [{ name: 'nodes', type: 'boolean', variadic: true }],
    output: 'boolean',
    category: 'logic',
  })
 
  lang.registerOp({
    name: 'Not',
    inputs: [{ name: 'a', type: 'boolean' }],
    output: 'boolean',
    category: 'logic',
  })
 
  lang.registerOp({
    name: 'Xor',
    inputs: [{ name: 'nodes', type: 'boolean', variadic: true }],
    output: 'boolean',
    category: 'logic',
  })

  // TODO: Add Nor, Nand, XNor?
 
  //? Comparison ops
  lang.registerOp({
    name: 'Equals',
    inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }],
    output: 'boolean',
    category: 'comparison',
  })
 
  lang.registerOp({
    name: 'NotEquals',
    inputs: [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }],
    output: 'boolean',
    category: 'comparison',
  })
 
  lang.registerOp({
    name: 'GreaterThan',
    inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    output: 'boolean',
    category: 'comparison',
  })
 
  lang.registerOp({
    name: 'LessThan',
    inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    output: 'boolean',
    category: 'comparison',
  })
 
  //? Control flow
  //  Note: If evaluates both branches eagerly (call-by-value).
  //  Short-circuit would require lazy evaluation — future work.
  lang.registerOp({
    name: 'If',
    inputs: [
      { name: 'condition', type: 'boolean' },
      { name: 'then', type: 'any' },
      { name: 'else', type: 'any' },
    ],
    output: 'any',
    category: 'control',
  })

  //? Higher-order list ops
  //  These use HigherOrderNode in the AST — the body is evaluated per item
  //  in a new environment.
  //  Op definitions below describe input/output shape for the editor.

  lang.registerOp({
    name: 'Filter',
    inputs: [{ name: 'list', type: 'any' }],
    output: 'any',
    category: 'list',
  })
 
  lang.registerOp({
    name: 'Map',
    inputs: [{ name: 'list', type: 'any' }],
    output: 'any',
    category: 'list',
  })
 
  lang.registerOp({
    name: 'Find',
    inputs: [{ name: 'list', type: 'any' }],
    output: 'any',
    category: 'list',
  })
 
  lang.registerOp({
    name: 'Reduce',
    inputs: [
      { name: 'list', type: 'any' },
      { name: 'initial', type: 'any' },
    ],
    output: 'any',
    category: 'list',
  })
 
  lang.registerOp({
    name: 'Every',
    inputs: [{ name: 'list', type: 'any' }],
    output: 'boolean',
    category: 'list',
  })
 
  lang.registerOp({
    name: 'Some',
    inputs: [{ name: 'list', type: 'any' }],
    output: 'boolean',
    category: 'list',
  })
 
  //? Evaluators
  lang.registerEvaluator({
    op: 'And',
    evaluate: ({ nodes }) => (nodes as boolean[]).every(Boolean),
  })
 
  lang.registerEvaluator({
    op: 'Or',
    evaluate: ({ nodes }) => (nodes as boolean[]).some(Boolean),
  })
 
  lang.registerEvaluator({
    op: 'Not',
    evaluate: ({ a }) => !Boolean(a),
  })
 
  lang.registerEvaluator({
    op: 'Xor',
    evaluate: ({ nodes }) => (nodes as boolean[]).filter(Boolean).length % 2 === 1, // TODO: Probably not the desired xor behaviour for more than 2 inputs.
  })
 
  lang.registerEvaluator({
    op: 'Equals',
    evaluate: ({ a, b }) => a === b,
  })
 
  lang.registerEvaluator({
    op: 'NotEquals',
    evaluate: ({ a, b }) => a !== b,
  })
 
  lang.registerEvaluator({
    op: 'GreaterThan',
    evaluate: ({ a, b }) => (a as number) > (b as number),
  })
 
  lang.registerEvaluator({
    op: 'LessThan',
    evaluate: ({ a, b }) => (a as number) < (b as number),
  })
 
  lang.registerEvaluator({
    op: 'If',
    evaluate: ({ condition, then, else: otherwise }) =>
      Boolean(condition) ? then : otherwise,
  })

  //? Higher-order evaluators — list ops
  //  apply() wraps environment extension + body interp.
  //  Evaluators receive resolved inputs and a callable.
 
  lang.registerHigherOrder({
    op: 'Filter',
    evaluate: ({ list }, apply) =>
      (list as unknown[]).filter(item => Boolean(apply(item))),
  })
 
  lang.registerHigherOrder({
    op: 'Map',
    evaluate: ({ list }, apply) =>
      (list as unknown[]).map(item => apply(item)),
  })
 
  lang.registerHigherOrder({
    op: 'Find',
    evaluate: ({ list }, apply) =>
      (list as unknown[]).find(item => Boolean(apply(item))) ?? null,
  })
 
  lang.registerHigherOrder({
    op: 'Reduce',
    evaluate: ({ list, initial }, apply) =>
      (list as unknown[]).reduce((acc, item) => apply(acc, item), initial),
  })
 
  lang.registerHigherOrder({
    op: 'Every',
    evaluate: ({ list }, apply) =>
      (list as unknown[]).every(item => Boolean(apply(item))),
  })
 
  lang.registerHigherOrder({
    op: 'Some',
    evaluate: ({ list }, apply) =>
      (list as unknown[]).some(item => Boolean(apply(item))),
  })
  
  return lang
}