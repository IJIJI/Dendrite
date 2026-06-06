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
  lang.registerType('number',  z.number())
  lang.registerType('string',  z.string())
  lang.registerType('any',     z.unknown())
 
  //? Logic ops
  // TODO: Short circuit evaluation? e.g. evaluate left to right, stop as the end result is determined.
  lang.registerOp({ name: 'And', inputs: [{ name: 'nodes', type: 'boolean', variadic: true }], output: 'boolean', category: 'logic' })
  lang.registerOp({ name: 'Or',  inputs: [{ name: 'nodes', type: 'boolean', variadic: true }], output: 'boolean', category: 'logic' })
  lang.registerOp({ name: 'Not', inputs: [{ name: 'a', type: 'boolean' }],                     output: 'boolean', category: 'logic' })
  lang.registerOp({ name: 'Xor', inputs: [{ name: 'nodes', type: 'boolean', variadic: true }], output: 'boolean', category: 'logic' })

  // TODO: Add Nor, Nand, XNor?
 
  //? Comparison ops
  lang.registerOp({ name: 'Equals',      inputs: [{ name: 'a', type: 'any' },    { name: 'b', type: 'any' }],    output: 'boolean', category: 'comparison' })
  lang.registerOp({ name: 'NotEquals',   inputs: [{ name: 'a', type: 'any' },    { name: 'b', type: 'any' }],    output: 'boolean', category: 'comparison' })
  lang.registerOp({ name: 'GreaterThan', inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }], output: 'boolean', category: 'comparison' })
  lang.registerOp({ name: 'LessThan',   inputs: [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }], output: 'boolean', category: 'comparison' })
 
  //? Control flow
  //  Note: If evaluates both branches eagerly (call-by-value).
  //  TODO: Short-circuit would require lazy evaluation - future work.
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
  //  higherOrder: true
  //  editor renders a body sub-graph input
  //  bodyBindings: Scoped variable names available inside the body
  lang.registerOp({ name: 'Filter', inputs: [{ name: 'list', type: 'any' }],                                   output: 'any',     category: 'list', higherOrder: true, bodyBindings: ['item'] })
  lang.registerOp({ name: 'Map',    inputs: [{ name: 'list', type: 'any' }],                                   output: 'any',     category: 'list', higherOrder: true, bodyBindings: ['item'] })
  lang.registerOp({ name: 'Find',   inputs: [{ name: 'list', type: 'any' }],                                   output: 'any',     category: 'list', higherOrder: true, bodyBindings: ['item'] })
  lang.registerOp({ name: 'Every',  inputs: [{ name: 'list', type: 'any' }],                                   output: 'boolean', category: 'list', higherOrder: true, bodyBindings: ['item'] })
  lang.registerOp({ name: 'Some',   inputs: [{ name: 'list', type: 'any' }],                                   output: 'boolean', category: 'list', higherOrder: true, bodyBindings: ['item'] })
  lang.registerOp({ name: 'Reduce', inputs: [{ name: 'list', type: 'any' }, { name: 'initial', type: 'any' }], output: 'any',     category: 'list', higherOrder: true, bodyBindings: ['acc', 'item'] })
 
  //? Evaluators: Standard operations
  lang.registerEvaluator({ op: 'And', evaluate: ({ nodes }) => (nodes as boolean[]).every(Boolean) })
  lang.registerEvaluator({ op: 'Or',  evaluate: ({ nodes }) => (nodes as boolean[]).some(Boolean) })
  lang.registerEvaluator({ op: 'Not', evaluate: ({ a })     => !a })
  lang.registerEvaluator({ op: 'Xor', evaluate: ({ nodes }) => (nodes as boolean[]).filter(Boolean).length % 2 === 1 })
 
  lang.registerEvaluator({ op: 'Equals',      evaluate: ({ a, b }) => a === b })
  lang.registerEvaluator({ op: 'NotEquals',   evaluate: ({ a, b }) => a !== b })
  lang.registerEvaluator({ op: 'GreaterThan', evaluate: ({ a, b }) => (a as number) > (b as number) })
  lang.registerEvaluator({ op: 'LessThan',   evaluate: ({ a, b }) => (a as number) < (b as number) })
 
  lang.registerEvaluator({
    op: 'If',
    evaluate: ({ condition, then, else: otherwise }) => condition ? then : otherwise,
  })

  //? Evaluators - higher-order ops
  // apply is always defined when called from the higher_order case in evaluate().
  lang.registerEvaluator({ op: 'Filter', evaluate: ({ list }, apply) => (list as unknown[]).filter(item  => Boolean(apply!(item))) })
  lang.registerEvaluator({ op: 'Map',    evaluate: ({ list }, apply) => (list as unknown[]).map(item    => apply!(item)) })
  lang.registerEvaluator({ op: 'Find',   evaluate: ({ list }, apply) => (list as unknown[]).find(item   => Boolean(apply!(item))) ?? null })
  lang.registerEvaluator({ op: 'Every',  evaluate: ({ list }, apply) => (list as unknown[]).every(item  => Boolean(apply!(item))) })
  lang.registerEvaluator({ op: 'Some',   evaluate: ({ list }, apply) => (list as unknown[]).some(item   => Boolean(apply!(item))) })
 
  // TODO: Add foldLeft and foldRight (/reduceLeft and reduceRight) to cover different associativity needs?
  lang.registerEvaluator({
    op: 'Reduce',
    evaluate: ({ list, initial }, apply) =>
      (list as unknown[]).reduce((acc, item) => apply!(acc, item), initial),
  })
 
  return lang
}