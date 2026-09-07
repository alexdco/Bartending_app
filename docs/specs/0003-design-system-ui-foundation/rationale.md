# Rationale: 0003. Design system and UI foundation

## Context

Recipe search and detail (the very next feature to build) needs a recipe card and a detail page on both mobile and web. Right now neither app has a real design system: mobile only has Expo's default scaffold theme file (a plain color object with no type scale, no spacing scale, no components), and web has nothing at all. Without this decision, the recipe search feature (or any feature after it) would each invent its own colors, spacing, and button styles, and mobile and web would drift apart visually from the very first screen.

The two apps also use fundamentally different styling mechanisms (React Native has no CSS; Next.js is CSS native), so "one design system" cannot mean one styling engine. It means one source of truth for the values (color, spacing, type scale) that both platforms' native styling mechanisms consume, plus parallel, platform appropriate component implementations that honor the same tokens and the same accessibility bar (WCAG AA, the scope's stated done when).

## Options considered

### Option 1: Tailwind (web) + Radix Primitives, React Native StyleSheet (mobile), one shared TypeScript token module

Web styles with Tailwind utility classes plus CSS custom properties for the token layer; accessible interactive behavior (focus trapping, ARIA, keyboard nav) comes from Radix Primitives underneath. Mobile uses React Native's built in `StyleSheet.create` fed by the same token values. Both platforms import their token values from one plain TypeScript module in `packages/shared`.

**Pros**:
- No new cross platform dependency; both platforms use their own native, well understood styling mechanism (Tailwind is already the de facto default for a new Next.js project; `StyleSheet` is React Native's own primitive).
- Radix Primitives closes the exact gap this feature must not get wrong: WCAG AA focus and keyboard handling for interactive components, without hand rolling ARIA logic.
- One token module matches the project's own rule in `AGENTS.md` ("non UI logic lives once in `packages/shared`"), so this is a natural extension of an existing convention, not a new pattern.

**Cons**:
- Two component implementations to maintain per primitive (a web Button and a mobile Button), not one shared component; token sharing is at the value level, not the component level.
- Radix Primitives is a web only library; mobile gets no equivalent library help and leans on React Native's own accessibility props (`accessible`, `accessibilityRole`) applied by hand.

### Option 1b: Skip Tailwind on web, keep CSS Modules + CSS custom properties

Web already has CSS Modules (no Tailwind installed yet). This variant keeps that, feeding the same token values into CSS custom properties directly, with no Tailwind config bridge at all.

**Pros**:
- Zero new web dependency; removes the entire "wire the token module into Tailwind's config" step, which is real work either way (see Decision).
- CSS Modules plus CSS variables is already proven in this repo (mobile's own scaffold references `global.css`, and web already scopes styles this way).

**Cons**:
- Loses Tailwind's utility class ergonomics (fast prototyping, consistent spacing/color usage enforced by the class system itself rather than by convention).
- Every future feature writes more raw CSS by hand instead of composing utility classes; slower for a small team building many similar surfaces (recipe cards, pantry chips) that Tailwind's utilities suit well.

### Option 2: NativeWind (Tailwind syntax on both platforms)

Adopt NativeWind so both apps write the same Tailwind utility class syntax; NativeWind compiles classes to native styles on mobile and real CSS on web.

**Pros**:
- Closer syntax parity: a component's className string looks the same on both platforms, which can shorten the learning curve for whoever builds the recipe card next.
- Fewer distinct styling mental models across the codebase.

**Cons**:
- An extra dependency and compiler step on top of Expo's own bundler, another moving part to keep working across Expo SDK upgrades.
- Class-to-native compilation has real parity gaps (some Tailwind utilities have no clean native equivalent), so "same syntax" does not mean "same guaranteed behavior"; debugging a mismatch costs more than writing two small native `StyleSheet` objects would have.
- Does not solve the actual hard problem here (WCAG AA interactive behavior); still need something like Radix on web and manual accessibility props on mobile regardless of which styling syntax is chosen.

### Option 3: A cross platform component library (Tamagui, Gluestack, or similar)

Adopt a single component library designed to render to both React Native and web from one component API.

**Pros**:
- Fastest path to a visually polished, consistent set of components across both platforms from one codebase, in principle.
- Some of these libraries include their own token/theming system, which could replace the need to hand design tokens.

**Cons**:
- A large, opinionated dependency to adopt for a project whose entire current component need is seven simple primitives (Button, Text, Card, Chip, Input, Spinner, EmptyState); this is a lot of surface area and lock in for what Slice 1 actually requires.
- These libraries' own compilers and theming systems are a new thing to learn and operate, on top of Expo and Next.js, for a two person (or small) team; a library specific bug becomes a harder dependency to debug or route around than a plain `StyleSheet` object.
- Working against the project's own "boring technology, prefer what's already there" instinct: neither app has committed to a cross platform UI kit yet, and this feature does not need one to hit its stated done when.

## Rationale

The project's own conventions decide most of this: `AGENTS.md` already states non UI logic lives once in `packages/shared`, consumed by both apps, never duplicated; a token module is exactly that pattern applied to design values, not a new idea. Neither app had adopted a styling approach yet, so this spec picks the one with the fewest moving parts that still meets the stated done when (WCAG AA on both platforms).

NativeWind (Option 2) and a cross platform kit (Option 3) both trade a real dependency and a new mental model for a problem this feature does not actually have: mobile and web already use two different rendering engines under the hood no matter which styling syntax sits on top, so unifying the syntax does not remove the platform split, it hides it until an edge case exposes it. The one part of this feature that is genuinely hard to get right by hand, accessible focus and keyboard handling for interactive components, is exactly what Radix Primitives solves on web; mobile's touch target and accessibility prop requirements are well documented platform conventions, not something a bigger library does meaningfully better than `StyleSheet` plus care.

Option 1b (skip Tailwind, keep CSS Modules) is a legitimate lighter path and was seriously considered: it removes the token-to-Tailwind bridge entirely. Tailwind is still chosen because the project will build many visually similar surfaces soon (recipe cards, pantry chips, tag lists in Slice 1 and beyond), and utility classes enforce consistent spacing/color usage at the point of writing each one, rather than relying on every contributor remembering the convention.

One refinement surfaced during the build: Radix Primitives has no bare Button primitive by design (a native `<button>` is already fully accessible), so Button is implemented as a plain native element on web, not a Radix wrapper. Radix `Toggle` is used for Chip instead, which is the component that actually needs pressed-state ARIA semantics. This is a faithful application of the spec's intent (Radix where it adds real accessible behavior), not a deviation from the decision.
