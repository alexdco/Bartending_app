# 0007. AI generated pantry drink ideas — rationale

## Context

Spec 0001 already decided the pieces this feature has to fit together: Anthropic Claude on the Haiku tier (a small, fast, inexpensive model), called only from a Supabase Edge Function (a small server function that runs close to the database) that checks a per person quota before calling out, so the API key never reaches a client app and cost stays bounded. What spec 0001 explicitly left open, and this spec closes, is the concrete quota numbers, and how a novel AI made recipe should look and behave next to the real recipe matches spec 0006 already built.

This is also the project's first Supabase Edge Function of any kind; nothing in the codebase yet calls an external AI provider, checks a server side quota, or has a Deno (the runtime Supabase Edge Functions run on) build target. The forces at play: the generated result has to feel trustworthy and safe (this is an alcohol focused app), it has to stay cheap regardless of how often a user asks for one, and it has to reuse the pantry data and session model spec 0005 and 0006 already established rather than inventing a second way to know what a user has on hand.

## Options considered

### Option 1: Structured output via Anthropic's `messages.parse()` with a Zod schema (recommended)

The Edge Function defines the recipe shape (name, ingredients, steps) as a Zod schema (a TypeScript library for describing and validating data shapes) and calls Anthropic's `messages.parse()`, which validates Claude's response against that schema and hands back a ready to use object, or `null` on a mismatch.

**Pros**:
- Anthropic's own current recommended pattern for a fixed, known output shape; no manual JSON parsing or markdown fence stripping.
- Schema and code stay in one place; a shape change is a one line schema edit.
- A failed validation is a clean `null`, easy to detect and retry (AC-7).

**Cons**:
- Ties the function to whichever Anthropic SDK version supports `messages.parse()`; a very old pinned SDK version would need an upgrade first (not a concern here, this is a new function).

### Option 2: Forced tool use with a hand written JSON schema

Define a `generate_drink_idea` tool with a JSON schema, force `tool_choice` to that tool, and read the arguments Claude passes back.

**Pros**:
- Familiar if the team already has tool calling elsewhere in the codebase (it does not yet).
- Also produces schema shaped output.

**Cons**:
- More boilerplate: a full JSON schema written by hand, plus manually pulling the result out of the response content array.
- Superseded by `messages.parse()` for exactly this "I just want typed JSON back" case; keeping it would mean maintaining two ways to get structured output from Claude in this codebase for no benefit.

### Option 3: Plain prompt asking for JSON, parsed by hand

Ask Claude in plain language to reply with JSON in a specific shape, then `JSON.parse()` the text response.

**Pros**:
- Zero new SDK surface to learn.

**Cons**:
- Fragile: models occasionally wrap JSON in prose or markdown fences, needing cleanup code with no guarantee it always works.
- No schema enforcement on the model's side; a malformed response only fails at `JSON.parse()` time with no structured signal to act on.

## Rationale

The core force here is that this function must return one fixed shape (a name, an ingredient list, numbered steps) every time, and do it cheaply on the Haiku tier spec 0001 already chose. `messages.parse()` (Option 1) is built for exactly this: the SDK validates Claude's output against a schema and hands back a typed object or `null`, so a malformed response is a single, obvious check rather than a string parsing problem to debug later. Option 2 (forced tool use) gets to the same place with more code to write and maintain, for a task with no other reason to reach for tool calling (there is nothing else for Claude to call out to; it only needs to answer once). Option 3 (plain prompt plus manual `JSON.parse()`) was ruled out because a model occasionally wrapping its answer in prose or markdown is a known failure mode this codebase would otherwise have to write and test cleanup code for, with no schema guarantee in return.
