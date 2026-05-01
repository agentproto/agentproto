---
schema: skills/v1
name: author-tool
title: Author a TOOL.md (AIP-14)
description:
  Walk through authoring a portable TOOL.md abstract contract — the agent's
  view of a single operation's identity, schemas, side-effect profile, and
  approval class. Implementation lives on a sibling AIP-30 DRIVER.md;
  this skill optionally chains into the author-driver skill afterwards.
version: 1.0.0
tags: [aip-14, tools, authoring, manifest, agentproto]
inputs:
  - name: purpose
    type: string
    required: true
    description:
      One-sentence statement of what the tool does. The skill turns this into
      name + description + schemas.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces
      a new folder under `.tools/<id>/`.
  - name: anticipatedProviders
    type: string
    required: false
    description:
      Comma-separated list of expected driver kinds (cli, http, mcp, sdk,
      builtin). Used to set `driver_constraints` and `default_driver`.
      Optional — defaults to "any kind, no default".
examples:
  - input:
      purpose:
        Fetch a SaaS product's public pricing tiers from its marketing page.
      anticipatedProviders: "http, sdk"
    output:
      - .tools/pricing-snapshot/TOOL.md
  - input:
      purpose:
        Strip personally-identifiable information from text.
      anticipatedProviders: "sdk, builtin"
    output:
      - .tools/pii-redact/TOOL.md
---

# Author a TOOL.md (AIP-14)

Use this skill when the user asks to **define an abstract tool contract**
that one or more drivers will implement. The skill produces a valid
[AIP-14 TOOL.md](/docs/aip-14) manifest — an abstract contract carrying
identity, schemas, side-effect profile, and approval class.

This skill **does not** produce an implementation. Implementation
(transport, code, auth, sandbox) lives on a sibling
[AIP-30 DRIVER.md](/docs/aip-30); after authoring the TOOL.md, chain
into the [author-driver skill](../../../aip-30/draft/skills/author-driver/SKILL.md)
to produce one or more DRIVER.md siblings.

## When to use

- "Make a tool that scrapes pricing pages."
- "Define a contract for image generation that any of OpenAI / Replicate /
  local SDXL could implement."
- "I have an existing function — extract its contract as a TOOL.md."

## When NOT to use

- The user wants a **multi-step automation** → use the
  [AIP-15 workflow-authoring skill](../../../aip-15/draft/skills/author-workflow/SKILL.md)
  instead.
- The user wants to **call** an existing tool — no authoring needed.
- The user wants a **user-facing button or voice command** that wraps the
  tool with UX → use the
  [AIP-28 author-intent skill](../../../aip-28/draft/skills/author-intent/SKILL.md)
  on top of an already-existing TOOL.md.

## Process

Follow these steps in order. Each step has a short justification — keep
them in the file you produce so reviewers see why each field ended up the
way it did.

### 1. Fix identity

- Pick `id`: dotted, lowercase, descriptive of the verb the tool performs
  (`pricing-snapshot`, `image.create`, `github.pr.merge`). Use dots for
  namespace.
- Write `name`: the human display label.
- Write `description`: one paragraph addressed **to the LLM caller**. Tell
  it when to call the tool and — equally important — when NOT to.

### 2. Decide the safety contract

This is the most important step. Get it right and governance and audit
([AIP-7](/docs/aip-7)) work for free.

- **`mutates`**: list every class of resource the tool may write. Format
  `<class>:<scope>` (`network:*` for HTTP, `workspace:/path` for FS
  writes, `database:invoices` for table writes, `external:stripe` for
  third-party API mutations). **A read-only tool has `mutates: []`.** Do
  not omit the field — explicit empty is the truthful answer.
- **`requires`**: capability requirements callers must hold. Subfields
  `network` (allowed hosts, `*` for wide), `secrets` (vault slugs the
  caller's session must have), `tools` (other tool ids this one calls).
  This is the gate; any driver implementing the tool inherits this
  requirement.
- **`approval`**: when does the user see a prompt?
  - `auto` — never (forbidden when `mutates` non-empty; schema enforces).
  - `on-mutate` — when `mutates` is non-empty.
  - `always` — every call (use for irreversible).
  - `policy:<ref>` — defer to a named approval policy ([AIP-7](/docs/aip-7)).
- **`risk_level`**: 0 (read), 1 (scoped write), 2 (external side effect),
  3 (irreversible).

### 3. Sketch input/output schemas

JSON Schema draft 2020-12 in the manifest. You MAY author in zod /
pydantic in any future code consuming the manifest, but the canonical
form here is JSON Schema.

- Inputs: be liberal in what you accept; declare optional fields generously.
  Drivers narrow via `schema_narrowing.drop_inputs` for what they don't
  support — the contract should carry the union of inputs ANY plausible
  driver needs.
- Outputs: be strict. Required fields are a guarantee every driver must
  satisfy.

### 4. Decide driver routing hints

Two optional fields bias the resolver:

- **`default_driver`**: a driver id the resolver picks when no other
  signal differentiates candidates. Use when one specific implementation
  is the canonical one (paid model, enterprise SLA, etc.).
- **`driver_constraints`**: declare allowed/forbidden driver kinds.
  - `forbid: ["http"]` — for tools handling PII or sensitive data,
    refuse third-party HTTP drivers.
  - `forbid: ["mcp"]` — refuse remote MCP servers (similar threat).
  - `require_kind: ["sdk", "builtin"]` — self-hosted only.
  - Empty / omitted = all kinds permitted (default).

### 5. Add baseline policies

- **`cost_class`**: trivial / metered / expensive. Drivers may
  override; the contract carries the baseline.
- **`timeout_ms`**: contract ceiling. Drivers may narrow; never widen.
  Default 30000.
- **`retry`**: contract baseline retry policy
  (`{ max_attempts, backoff, initial_ms }`). Drivers may override.
- **`idempotent`**: logical idempotency. Different from network-level
  retry safety (which lives on DRIVER).

### 6. Add examples

`examples[]` is driver-agnostic — every conformant driver MUST
satisfy these. Author 2-5 input/output pairs covering the canonical
happy paths plus 1-2 edge cases that all drivers should handle the
same way (empty input, large input, special characters).

Driver-specific edge cases (DALL-E doesn't support seed, Replicate is
slow on cold starts) live on the DRIVER's own examples, not here.

### 7. Validate

Run the manifest through
[`./resources/aip-14/draft/TOOL.schema.json`](../../TOOL.schema.json):

```bash
ajv validate -s TOOL.schema.json -d .tools/<id>/TOOL.md \
  --remove-additional fail \
  --strict
```

Reject manifests with extra unknown keys (catches typos like `runner:`
which used to be valid pre-AIP-30 — now it's a moved-to-DRIVER signal).

### 8. Author at least one DRIVER.md sibling

The TOOL.md alone is a contract; without a driver it can't be invoked.
Run the [author-driver skill](../../../aip-30/draft/skills/author-driver/SKILL.md)
with the contract you just authored as input. The skill emits a sibling
DRIVER.md whose `implements[0].tool` references this TOOL.md.

For a tool that obviously has only one implementation (host-builtin
filesystem, e.g.), produce a single `kind: builtin` DRIVER.md
co-located in the same folder. For a tool with multiple anticipated
implementations, leave the implementation slot open — drivers can
register independently as they're authored.

### 9. Wire to the host

```ts
import { loadTool } from "@agstudio/tool-runtime"
import { loadProvider } from "@agstudio/driver-runtime"

const tool = await loadTool("./.tools/pricing-snapshot/TOOL.md")
const driver = await loadProvider("./.drivers/apollo-pricing-http/DRIVER.md")

// host wires tool ↔ driver via the resolver
registry.registerTool(tool)
registry.registerProvider(driver)
```

The tool now appears in the host's catalog, the resolver picks drivers
per call, and the audit log records contract + resolved driver on each
invocation.

## Output structure

The skill emits at minimum:

```
.tools/<id>/
  TOOL.md            ← always (the abstract contract)
  README.md          ← optional long-form
```

Plus a chain into the author-driver skill that emits one or more:

```
.drivers/<driver-id>/
  DRIVER.md
  SECRETS.md         ← when auth is needed
  driver.ts        ← when custom dispatch is needed
```

When `anticipatedProviders` is provided, the skill kicks off the
author-driver chain immediately for each. Otherwise, the user runs the
chain later when they're ready.

## Common mistakes

- **Adding `entry`, `code`, `run`, `runner`, `secrets`, or `network` to
  TOOL.md.** These belong to DRIVER.md (per AIP-30). The schema rejects
  them; this skill MUST NOT emit them.
- **Adding `execute` to the `defineTool` call.** `defineTool` no longer
  accepts an `execute` field. Bodies live on `defineDriver().execute`.
- **Approving `auto` with non-empty `mutates`.** Schema rejects this.
  Use `on-mutate` or `always`.
- **Inputs that are driver-specific.** If only one driver supports
  `seed`, declare `seed` as optional on the contract; the other drivers
  declare `schema_narrowing.drop_inputs: [seed]`. Don't fork the contract.
- **Mutable `id`.** `id@major` is the registration key. Renaming is a
  breaking change.
- **Forgetting `mutates` declarations.** Every class of mutation any
  driver might perform MUST be declared on the contract. Audit logs
  consume this directly.
