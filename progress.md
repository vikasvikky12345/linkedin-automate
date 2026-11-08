# JS + Angular Interview Prep: Progress

Started: 2026-10-28 | Last session: 2026-11-08 | Streak: 3 days | Done: 1/50

## Topics
Status: [ ] not started, [~] needs revision, [x] done (score)

### Logic Building (added 2026-11-04, do first: approach problems, pick loops/methods, add checks, spot patterns, read code)
- [~] L1. Reading code: dry runs, trace tables, explaining code (6.5/10: trace 7, read-code 4, index check 7, problems 6.5/7/9.5, pattern spotting 6.5)
- [x] L2. Loops: for / for...of / for...in / while, when to use which (7/10: trace 7, read-code 7.5, firstNegativeIndex 7.5, countDigits 6.5, topSubject 6.5, pattern spotting 8.75)
- [~] L3. Conditions and checks: guard clauses, validation, edge-case checklist (answers shown for problems 2-4, redo them unaided. Coach session 2026-11-08 unaided parts: trace warm-up 7.5/9, read-code getInitials 8.5, safeDivide 7; pattern spotting answers 2-3 were also pasted review text)
- [ ] L4. Accumulator pattern (loop, then reduce)
- [ ] L5. Frequency counter with object/Map
- [ ] L6. Array methods by intent (loop <-> method)
- [ ] L7. Object methods: keys/values/entries/fromEntries, groupBy, lookup maps
- [ ] L8. Two pointers and sliding window
- [ ] L9. Nested data and basic recursion
- [ ] L10. Mixed pattern-recognition round

### Part A: JavaScript
- [~] 1. Variables (var/let/const), scope, hoisting, TDZ (6.5/10; revision 1: 3.8/5; revision 2: 3.67/5, finished 3/3 on the last question; Topic 2 warm-up: 3/6. Re-test in the Topic 3 warm-up; Topic 3 warm-up: 1/4, typeof + TDZ missed)
- [~] 2. Data types, type coercion, == vs ===, truthy/falsy, typeof quirks (6.5/10: puzzles 10.5/15, coding 6/10, scenarios 6.5/10; Topic 3 warm-up: 2.5/5, missed null == 0 again and 0 === -0)
- [~] 3. Operators, short-circuit, ??, ?. (6.5/10: puzzles 13/14, coding 21.5/30, scenarios 3.5/10 avg)
- [x] 4. Functions: declaration vs expression, arrow functions, default/rest params (7.5/10: warm-up 5.5/7, puzzles 11/15, coding 17/20, scenarios 15.5/20)
- [ ] 5. Arrays & array methods (paused for Logic Building: warm-up 3/4, puzzles 8.5/13, uniqueBy 9/10; resume at Problem 2 flatten)
- [ ] 6. Objects: destructuring, spread, shallow vs deep copy, structuredClone
- [ ] 7. Strings & template literals
- [ ] 8. Execution context, call stack, lexical environment
- [ ] 9. Closures
- [ ] 10. this, call/apply/bind (+ bind polyfill)
- [ ] 11. Prototypes, classes, inheritance
- [ ] 12. Higher-order functions, currying, composition, pure functions
- [ ] 13. DOM, events, bubbling/capturing, event delegation
- [ ] 14. Error handling, custom errors
- [ ] 15. Event loop: microtasks vs macrotasks
- [ ] 16. Promises, async/await, Promise combinators (+ polyfills)
- [ ] 17. Debounce, throttle, memoization
- [ ] 18. Generators, iterators, Symbols
- [ ] 19. ES modules, tree shaking, dynamic import
- [ ] 20. Memory leaks, GC, WeakMap/WeakRef
- [ ] 21. Web APIs: fetch, AbortController, storage, IntersectionObserver
- [ ] 22. Performance: reflow/repaint, rendering pipeline, Web Workers
- [ ] 23. Security: XSS, CSRF, CORS, CSP
- [ ] 24. Polyfills round
- [ ] 25. DSA for frontend

### Part B: Angular
- [ ] 26. Architecture, CLI, standalone vs NgModule
- [ ] 27. Components, templates, lifecycle hooks
- [ ] 28. Data binding, input()/output()/model()
- [ ] 29. Directives, control flow @if/@for/@switch
- [ ] 30. Pipes: pure vs impure, async pipe
- [ ] 31. Services & DI, hierarchical injectors, inject()
- [ ] 32. Routing: lazy loading, guards, resolvers
- [ ] 33. Forms: template-driven vs reactive, validators, typed forms
- [ ] 34. HttpClient, interceptors
- [ ] 35. RxJS core
- [ ] 36. RxJS advanced: flattening operators, unsubscribe strategies
- [ ] 37. Component communication
- [ ] 38. Change detection: OnPush, Zone.js, zoneless
- [ ] 39. Signals: signal, computed, effect, linkedSignal, resource
- [ ] 40. State management: signals vs NgRx
- [ ] 41. Performance: track, @defer, virtual scroll
- [ ] 42. Content projection, ng-template, dynamic components
- [ ] 43. SSR, hydration, SEO
- [ ] 44. Testing
- [ ] 45. Security in Angular, auth flows
- [ ] 46. Architecture & design patterns, micro-frontends
- [ ] 47. Migration scenarios, error handling, case studies

### Part C: Interview Readiness
- [ ] 48. Machine-coding rounds
- [ ] 49. Frontend system design
- [ ] 50. Full mock interviews

## Weak Areas
- Topic 1: shadowing + hoisting. A local var/let anywhere in a scope shadows the outer variable from the first line (var gives undefined, let/const give TDZ error). Missed 3 times.
- Topic 1: var ignores if-blocks when hoisting, even `if (false)`. Missed again in revision.
- Topic 1: choosing between "x is not defined" and "Cannot access 'x' before initialization". If a let/const exists in an enclosing scope (even via a hoisted inner function), it's the TDZ error.
- Topic 1: after an uncaught error, stop predicting output (nothing after it runs).
- Topic 1: after learning the TDZ, started over-predicting errors. Walking up the scope chain and finding an initialized variable gives a plain value (a sibling function's let is invisible).
- Techniques taught: (1) "rewrite before you read": move every var to the top without its value; (2) "walk up, never down": value / TDZ / not defined.
- Topic 1: assigning without let/const creates an implicit global (and throws in strict mode / modules).
- Topic 1: read the spec fully (return values), and know ++x vs x++.
- Topic 1: explain the "why" precisely, and write the code (e.g. the IIFE fix), not just the idea.
- Topic 1 (Topic 2 warm-up): skipped the first call a() and gave "not defined" instead of the TDZ error. Go through every call in order.
- Topic 2: mixed up Object.is vs ===. They differ in two cases that go in opposite directions: NaN (=== false, Object.is true) and 0/-0 (=== true, Object.is false). Also == says NaN is never equal (used Object.is semantics in looseEqual).
- Topic 2: null == 0 is false (special == rule) but null >= 0 is true (relational operators convert to numbers).
- Topic 2: typeof typeof x is always 'string'. Read nested typeof from the inside out.
- Topic 2: gives bare answers with no reasoning, even when reasoning is required. Always say the coercion steps out loud.
- Topic 2: read the spec. looseEqual used == (forbidden) and turned into a deep-equal. Re-attempt looseEqual from memory.
- Topic 2: syntax slips under pressure: & vs &&, = vs ===, AND vs OR in validation conditions.
- Topic 1 (Topic 3 warm-up): `typeof x` is only safe for UNDECLARED names. If a let/const x exists later in the scope, typeof throws the TDZ error.
- Topic 2 (Topic 3 warm-up): null == 0 is false AGAIN (3rd miss). `x == null` matches only null and undefined, never 0, '' or false. Couldn't explain why `== null` is used in get().
- Topic 3: `??` returns the RIGHT side when the left is nullish (null ?? 0 ?? 5 → 0, not null).
- Topic 3: a SyntaxError (e.g. mixing ?? with ||) stops the whole file at parse time, so no line prints, not even the earlier ones.
- Topic 3: a truthy `? :` check has the same 0/'' bug as ||. Fixed 3 fields with ?? and then reintroduced the bug in the 4th.
- Topic 3: default params and destructuring defaults apply only for undefined, not null. buildConfig() crashed because opts had no default.
- Topic 3: ?? is NOT always better. After Number(x) the null is gone: Number(null) = 0 and Number('abc') = NaN, so `Number(v) ?? 20` never falls back. Validate with Number.isInteger(n) && n > 0.
- Topic 3: read error messages exactly. "reading 'name' of undefined" means the OBJECT before .name is undefined.
- Topic 3: invalid syntax under pressure (`item??.qty`). Re-read the fix once before submitting.
- Topic 3: prototype pollution in setIn/merge helpers (__proto__ / constructor / prototype keys). Revisit in Topic 23.
- Topic 3: skips the "explain why" and trade-off parts of questions (part b of scenario 1, operator choice in setIn).
- Event loop: setTimeout is a Web API timer callback in the macrotask queue, not a Promise (covered in Topic 15).
- Topics 1-3 (Topic 4 warm-up): null == 0 finally right (5.5/7). Still treated a SyntaxError as if earlier lines print; it fails at parse time, nothing prints.
- Topic 4: STILL gives bare answers with no reasoning, even when told it's required (Puzzle 3 got half marks). Biggest habit to fix.
- Topic 4: said regular functions "inherit this from their scope". Wrong: arrows take this from where they're written; regular functions from how they're called.
- Topic 4: named function expression name is visible only inside its body; explained it as "because bar is a function".
- Topic 4: write typeof results as strings ('undefined', 'function') and name error types (TypeError).
- Topic 4: once() edge cases: fn throwing leaves it broken (called set first); fn = null for GC.
- Topic 4: leaves answers unfinished (Scenario 1c trade-off not answered, Scenario 2c guard code missing). Finish every part.
- Topic 4: stops at the first fix. Missed: removeEventListener + bind silently fails (new function each time); memo cache key ignored options; unbounded cache growth.
- Topic 5: sort without a comparator changes the order, never the values (wrote ['1','5',10]). === on objects compares references, not types.
- Topic 5: [NaN].includes(NaN) is true (SameValueZero); indexOf gives -1. flat() flattens one level of EVERY item.
- Logic building (self-reported 2026-11-04): hard to approach problems, pick a loop or method, add checks, spot patterns, read code. Logic Building track L1-L10 added.
- L1: traces the code it EXPECTS, not the code written (read 'abc'[3] as 'c', skipped the i = 0 row). Read every index from an index table; evaluate each condition with real values (0 > 0 is false).
- L1: length vs last index: str[str.length] is undefined; backward loops start at length - 1.
- L1: lists edge cases without deciding the output (3 problems in a row); guard returned input instead of the promised type. Fixed by Problem 3.
- L1: two-step patterns: "names of users older than 18" = filter THEN map (filter while the field still exists).
- L1: skips the "why" in quick answers (pattern spotting, index check).
- L2: fix rounds only half done (did about half of each fix list). Tick off every review item before sending.
- L2: wrong expected values in test comments 3 problems in a row ('Math' vs 'math', stale values after changing the return). Work each one out from the rule.
- L2: "nothing" value must match the return type: index -1, name null, count 0, list []. Returned {} / -1 / arrays from a name function.
- L2: scope: missed the spec (returned the value, not the index) then added unrequested features (array support, return-all-ties). Build exactly the spec; ask if unsure.
- L2: line order in traces: write each value AFTER its line runs (count++ was one behind); lines before the loop run once (thought `if (n === 0)` ran inside the loop).
- L2: `while (num)` checks truthy/falsy, not "is it a number"; 0 is falsy and ends the loop.
- L2: return vs console.log: a function returns its value with or without console.log.
- L3: in traces, wrote whether the input "passes" instead of the condition's real value (inverted all 3 guard rows for '9lives'). A guard returns when its condition is TRUE.
- L3: Array.isArray([]) is true; thought the type guard catches empty arrays. Empty is a separate edge case. Also thought sumPositive("5") converts the string (the guard returns 0).
- L3: Big-O: called one loop with fixed work per item O(n^2). Nested loop over the same data = n^2, otherwise O(n).
- L3: skips method steps (hand-worked examples, all 6 checklist items, dry run, Big-O) unless given a tick-box checklist.
- L3: tests on own data instead of the given data. Run the given data first.
- L3: guard before Object.values/keys: Object.values(null) throws. Bad input returns the "nothing" of the return type (false for a boolean).
- L3: REDO UNAIDED: isValidUsername, getActiveEmails (trim + lowercase + dedupe, loop and filter->map), validateSignup (collect all errors), and 3 fresh pattern-spotting items.
- L3: compared values of different types in guards: `typeof a !== Number.isFinite(a)` (string vs boolean), `fullName !== String` (vs the function). Use `!Number.isFinite(a)` / `typeof x !== 'string'`.
- L3: checked a literal instead of the input: `Array.isArray({})`. Used `.contains` (not a string method: `.includes`) and `part[i]` with no `i`.
- L3: `a && b || c` runs as `(a && b) || c`; when ALL rules must hold, it's `&&` all the way. Each char range is its own `&&` pair, joined by `||`.
- L3: asked for the full answer on problems 2-4 (isValidUsername, getActiveEmails v2, validateSignup) instead of attempting. Redo them from the problem text.

## Mock Interview Scores
| Date | Focus | Score | Verdict |
|------|-------|-------|---------|

## Daily Log
| Date | Topic | Mode | Score | Notes |
|------|-------|------|-------|-------|
| 2026-10-29 | 1. Variables, scope, hoisting, TDZ | Full session | 6.5/10 | Strong on definitions, TDZ errors, function hoisting, global var collisions. Weak on shadowing+hoisting puzzles and the bugs in coding solutions. |
| 2026-10-29 | 1. Variables, scope, hoisting, TDZ | Revise | 3.8/5 | Q1 and Q4 fully right. Missed `if (false)` var hoisting again, predicted output after a throw, and mixed up the TDZ vs "not defined" errors. Improving. |
| 2026-10-29 | 1. Variables, scope, hoisting, TDZ | Revise 2 | 3.67/5 | Got the var-in-block case right once using the rewrite technique. Over-predicted errors once (paint → 'dark'). Final mixed question 3/3. |
| 2026-10-29 | 2. Data types, coercion, ==/===, typeof | Full session | 6.5/10 | Warm-up (Topic 1) 3/6. Puzzles 10.5/15 (strong on [] + {}, string comparison; weak on Object.is, null >= 0, typeof typeof). getType 8/10, objectIs 9/10 after a hint, looseEqual not solved (showed answer). Scenarios: good on route param string vs number, weak fix code in the validation scenario. |
| 2026-10-30 | 3. Operators, ??, ?., logical assignment | Full session | 6.5/10 | Warm-up 3.5/9 (T1 typeof+TDZ, T2 null == 0 missed again). Puzzles 13/14, strong on ?. chain short-circuit and ??= with a getter/setter. Coding: buildConfig 5/10, get 9/10, setIn 7.5/10 (missed prototype pollution). Scenarios 4/10 + 3/10: right diagnosis, but invalid fix syntax and the Number() ?? trap. |
| 2026-11-04 | 4. Functions | Full session (2026-11-02 to 11-04) | 7.5/10 | Warm-up 5.5/7 (null == 0 right at last). Puzzles 11/15: all right, marks lost for no reasoning. once 8.5, pipe 8.5 (fixed multi-arg first fn after a hint). Scenarios 7.5 + 8: excellent this/default-param diagnosis, missed bind+removeEventListener trade-off, cache key and growth, unfinished guard code. |
| 2026-11-04 | 5. Arrays (paused) | Full session, partial | partial | Warm-up 3/4 (SyntaxError at parse time finally right). Puzzles 1.5/4, 2/5, then 5/5 once reasons were given. uniqueBy 9/10 (Set, O(n), did not name the Big-O). Paused: user asked for a logic-building plan first. |
| 2026-11-08 | L1. Reading code, trace tables | Full session (2026-11-06 to 11-08) | 6.5/10 | Asked for a fuller framing twice. Trace slips (0 > 0, str[3]). Problems improved: reverseString 6.5, countVowels 7 (+ filter().length version), capitalizeWords 9.5 with all 5 steps and edge-case tests. Pattern spotting 2/3 (missed map after filter). |
| 2026-11-08 | L2. Loops | Full session | 7/10 | Loop choice now solid (while for unknown steps, for for index, Object.entries for objects). Traced for...in '0012' right. countDigits needed a line-by-line trace to fix count++ order and the 0-is-falsy exit. Fix rounds half done; test expectations wrong 3 times; mixed 'nothing' types (-1, {}, arrays). |
| 2026-11-08 | L3. Conditions and checks | Practice problems | not scored | safeDivide: plan right, guard compared a string to a boolean (fixed). getInitials: 3 bugs. getActiveEmails: wrong Array.isArray target, .contains, && / || mix. isValidUsername, getActiveEmails v2 (lowercase, dedupe with Set, filter→map) and validateSignup (accumulator) were shown as full answers on request. Redo unaided before marking done. |
| 2026-11-08 | L3. Conditions and checks | Coach session | partial | Unaided: trace 7.5/9 (B3/B4 reasons wrong), getInitials read+fix 8.5, safeDivide 7 (no Big-O/dry run). P2-P4 and pattern spotting submissions matched answers shown earlier, so not scored. Stays [~]; redo P2-P4 unaided next. |
