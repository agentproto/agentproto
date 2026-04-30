# ADAPTER.md — implementing AIP-25 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, validate, and register** AIP-25
[`PERSONA.md`](/docs/aip-25) files. It is normative for the parts marked MUST
and informative for the parts marked SHOULD.

The audience is a framework or runtime author — someone exposing `definePersona`
to persona authors. Persona authors themselves should read
[`./skills/author-persona/SKILL.md`](./skills/author-persona/SKILL.md), not this
file.

A persona is a **single-doc** artifact. A host that already implements
[AIP-3](/docs/aip-3) SKILL.md or [AIP-14](/docs/aip-14) TOOL.md will recognise
the loader skeleton — parse + validate + resolve refs — and can re-use most of
it for PERSONA.md.

## Contract overview

A conforming host implements three responsibilities, in this order when a
`PERSONA.md` is registered:

1. **Parse the manifest.** Read `PERSONA.md`, split frontmatter from body, parse
   the YAML, validate against [`./PERSONA.schema.json`](./PERSONA.schema.json),
   surface structured errors.
2. **Resolve composition.** Walk the `extends:` chain bottom-up, merging each
   ancestor into the accumulator using the strategy table below. Detect cycles,
   depth overflow, and missing parents as warnings.
3. **Resolve cross-AIP refs and register.** Validate that `identity`,
   `appliesTo`, `relationships[].persona`, `boundaries.redirects[].to`, and any
   `extends` parent resolve in the host's registry. Wire the merged effective
   config into the host's persona catalog and expose both the merged config AND
   the resolution chain on the debug surface.

The signature `definePersona` exposes is the boundary between the host and the
author. The host MAY internally translate to its own persona type after the
call, but `definePersona` is what the author calls when they want to construct a
persona from code rather than from a markdown file.

## Parse + validate

The host MUST validate the parsed frontmatter against
[`./PERSONA.schema.json`](./PERSONA.schema.json) before doing anything else.
Validation failures travel as structured errors with JSON Pointer-style field
paths so authors can locate the problem in their YAML.

### Minimum required fields

Every conforming `PERSONA.md` declares:

- `schema: persona/v1` — the schema dispatch tag.
- `name` — kebab-case identifier, 2–64 chars.
- `title` — human-readable display title, 1–120 chars.
- `description` — one-paragraph elevator pitch, 1–2000 chars.
- `version` — semver string.

A manifest missing any of these MUST be rejected with `persona_invalid` (HARD).
The error envelope SHOULD include the list of missing required fields and the
path to the manifest file.

### Body extraction

The host SHOULD extract the markdown body and expose it on the loaded persona's
effective config under `body`. The body is free-form markdown; the host MUST NOT
validate it against any schema. Most hosts pass the body verbatim into the
agent's character-prompt slot at activation time.

## `definePersona` — the entry-point function

A host MAY expose a code-side persona constructor under the canonical name
`definePersona`. Authors who prefer YAML use `PERSONA.md`; authors who prefer
code call `definePersona(...)`. Both paths produce the same loaded persona
shape.

### Required behaviour

A host that implements `definePersona` MUST:

1. **Accept a value matching the schema.** Every field in `PERSONA.schema.json`
   MAY appear in the call argument. The manifest's required fields (`schema`,
   `name`, `title`, `description`, `version`) are required arguments.
2. **Validate the argument** against the same schema used for `PERSONA.md`.
   Rejection MUST throw `persona_invalid`.
3. **Resolve composition** identically to the file-based path — `extends` works
   whether authored in YAML or in code.
4. **Surface the same effective config and resolution chain** on the debug
   surface.

### Signature (TypeScript notation, normative)

```ts
definePersona(definition: PersonaDefinition): PersonaHandle

interface PersonaDefinition {
  schema:        "persona/v1"
  name:          string
  title:         string
  description:   string
  version:       string
  extends?:      string
  avatar?:       string
  backstory?:    Backstory
  voice?:        Voice
  boundaries?:   Boundaries
  defaultLocale?: string
  multilingual?: string[]
  relationships?: Relationship[]
  identity?:     string
  appliesTo?:    string[]
  tags?:         string[]
  metadata?:     Record<string, unknown>
  body?:         string
}
```

A host MAY re-export `definePersona` under host-idiomatic aliases
(`createPersona`, `persona`, `registerPersona`). The canonical name MUST be
present.

## Composition (`extends:` chain)

Composition is the mechanism by which a persona ships a variant without forking
the parent. When a host loads a `PERSONA.md` whose `extends:` is set, it MUST:

1. **Walk the parent chain.** Recursively load the parent at the path referenced
   by `extends:`; that parent's parent; until a manifest with no `extends:` is
   reached.
2. **Cap depth at eight.** Implementations MUST refuse to recurse beyond
   depth 8. Exceeding the cap is a _warning_, not an error — the host falls back
   to the local manifest only and surfaces `persona_extends_depth_exceeded` to
   the consumer's debug surface.
3. **Detect cycles.** Track visited absolute paths during the walk. If the chain
   re-enters a path, surface `persona_extends_cycle` as a warning and fall back
   to the local manifest only.
4. **Tolerate missing parents.** If `extends:` points to a path that does not
   exist on disk (or in the registry), surface `persona_extends_missing` as a
   warning and use the local manifest only.
5. **Merge bottom-up.** Walk the chain from the workspace root toward the leaf,
   merging each manifest into the accumulator using the strategy below. Child
   wins on overrides; arrays of declarations append-and-dedupe.

### Merge strategy

The append-and-dedupe default for arrays of declarations is the load-bearing
convention. Authors expect a child persona to _extend_ the parent's signature
phrases, not replace them.

| Field                                     | Strategy           | Notes                                                                       |
| ----------------------------------------- | ------------------ | --------------------------------------------------------------------------- |
| `name`, `title`, `description`, `version` | override           | Child's identity wins.                                                      |
| `extends`                                 | local-only         | Not inherited.                                                              |
| `avatar`                                  | override           | Child swaps the face.                                                       |
| `backstory.oneLineHook`                   | override           | Child wins.                                                                 |
| `backstory.background`                    | override           | Child rewrites the lore prose if set.                                       |
| `backstory.archetypes`                    | append + dedupe    | Lineage accumulates archetype strings.                                      |
| `backstory.era`, `backstory.setting`      | override           | Child wins.                                                                 |
| `voice.register`                          | override           |                                                                             |
| `voice.signaturePhrases`                  | append + dedupe    |                                                                             |
| `voice.tonality`                          | append + dedupe    |                                                                             |
| `voice.formality`                         | override           |                                                                             |
| `voice.emojiUsage`                        | override           |                                                                             |
| `voice.signOff`                           | override           |                                                                             |
| `boundaries.refuses`                      | append + dedupe    | A child cannot remove parent refusals.                                      |
| `boundaries.defers`                       | append + dedupe    |                                                                             |
| `boundaries.redirects`                    | merge-by-`topic`   | Child entry with same `topic` replaces parent's; new topics appended.       |
| `defaultLocale`                           | override           |                                                                             |
| `multilingual`                            | append + dedupe    |                                                                             |
| `relationships`                           | merge-by-`persona` | Child entry with same `persona` ref replaces parent's; new refs appended.   |
| `identity`                                | override           | Child wins.                                                                 |
| `appliesTo`                               | local-only         | Each persona declares its own consumer scope.                               |
| `tags`                                    | append + dedupe    |                                                                             |
| `metadata`                                | deep-merge         | Recursive merge; vendor namespaces accumulate.                              |
| `body` (markdown)                         | override           | Child's body replaces parent's body. Most leaf personas write a fresh body. |

The host MUST expose **both** the merged effective config AND the resolution
chain (ordered list of absolute paths consumed during merge) on the debug
surface. A reviewer auditing a deployed persona hashes the merged effective
config; a third-party importer follows `extends:` to its terminal root; a host
swap re-derives the same lens from disk.

## Cross-AIP ref resolution

A persona composes with the rest of the AIP family through ref fields. The host
MUST resolve every cross-AIP ref it loads:

| Field                                             | Target AIP                           | Resolution                                                                                                                         |
| ------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `identity`                                        | [AIP-23](/docs/aip-23) IDENTITY      | Resolve `ws://identities/<slug>` against the host's identity registry. Failure surfaces `persona_identity_unresolvable` (warning). |
| `appliesTo[]` (`ws://operators/<slug>`)           | [AIP-9](/docs/aip-9) operator        | Resolve against the host's operator registry. Failure surfaces `persona_appliesto_unresolvable` (warning).                         |
| `appliesTo[]` (`ws://skills/<slug>`)              | [AIP-3](/docs/aip-3) skill           | Resolve against the host's skill registry. Failure surfaces `persona_appliesto_unresolvable` (warning).                            |
| `appliesTo[]` (`ws://assemblies/<slug>/<member>`) | [AIP-24](/docs/aip-24) assembly seat | Resolve assembly + seat. Failure surfaces `persona_appliesto_unresolvable` (warning).                                              |
| `relationships[].persona`                         | another `persona/v1`                 | Resolve against the host's persona registry. Failure surfaces `persona_relationship_unresolvable` (warning).                       |
| `boundaries.redirects[].to`                       | another persona/operator/skill       | Resolve via the appropriate registry by URI scheme prefix. Failure surfaces `persona_redirect_unresolvable` (warning).             |

**All cross-AIP refs are warnings, not errors, on resolution failure.** A
persona must remain usable even when its declared relationships, redirects, or
`appliesTo` consumers are partially provisioned. This is by design — the persona
is the _face_, and the face stands without a complete world around it. A caller
that depends on a specific cross-AIP ref MAY refuse to use the persona when the
ref is unresolved; that is a runtime concern.

## Effective config exposure

The host SHOULD expose, on a per-persona debug surface:

- **Merged effective config** — the post-merge frontmatter, with every array
  de-duped and every override applied. This is the shape the host uses at
  runtime.
- **Resolution chain** — the ordered list of absolute paths consumed during
  merge. The leaf persona is last; the root ancestor is first. This is what
  makes a deployed persona auditable.
- **Warnings list** — every `persona_*` warning surfaced during load. Authors
  fix these incrementally; the persona loads regardless.
- **Body** — the markdown body, post-merge.

This surface is the standard "is this persona installable?" handshake. A
conforming host SHOULD provide a `validatePersona(manifestPath)` helper that:

1. Parses the manifest.
2. Validates against `PERSONA.schema.json`.
3. Resolves the `extends` chain, surfacing chain warnings.
4. Resolves every cross-AIP ref, surfacing ref warnings.
5. Returns the effective config + resolution chain + warnings.

## Conflict cases (worked examples)

Five worked examples covering the most common conflict shapes authors run into.

### 1. Extends override — scalar field

Parent declares `voice.register: warm-direct`; child declares
`voice.register: terse`. Result: the child's value wins. The parent's `register`
value is dropped from the merged effective config. The resolution chain still
records the parent's manifest path so an auditor can trace the override.

### 2. Voice append — accumulating phrases

Parent declares `voice.signaturePhrases: ["take your time", "—M."]`; child
declares `voice.signaturePhrases: ["one step at a time"]`. Result: the merged
effective config has
`voice.signaturePhrases: ["take your time", "—M.", "one step at a time"]`.
Append-and-dedupe is the default for any array of declarations the persona
accumulates over its lineage.

### 3. Archetypes dedupe

Parent declares `backstory.archetypes: [mentor]`; child declares
`backstory.archetypes: [mentor, craftsman]`. Result: the merged effective config
has `backstory.archetypes: [mentor, craftsman]` — the duplicate `mentor` is
collapsed via the dedupe pass. The order is parent-first, then child's new
entries.

### 4. Boundary erosion warning

Parent declares `boundaries.refuses: [tax-advice, legal-advice]`; child declares
`boundaries.refuses: []`. Naive override would shrink the merged list to `[]`
and silently relax the parent's refusals. AIP-25's append-and-dedupe rule
prevents this — the child's empty array does not erase the parent's entries; the
merged effective config retains
`boundaries.refuses: [tax-advice, legal-advice]`. A host MAY surface a warning
when the child _attempts_ to set `refuses: []` to alert the author that the
array is not behaving as override (`persona_boundary_erosion_attempt`,
advisory).

### 5. Cross-AIP ref unresolvable

Persona declares `identity: ws://identities/academic-researcher`, but the host's
identity registry has no such workspace. Result: the persona loads with the
`identity` field present in the effective config; the host surfaces
`persona_identity_unresolvable` on the warnings list. A caller that needs the
identity substance MAY refuse to use the persona; a caller that only needs the
persona's face proceeds without the identity ref. The persona itself is not
blocked.

## Error envelope

Errors leave the host as structured envelopes. The envelope code MUST be one of
the AIP-25 vocabulary below:

| Code                                | Severity | Meaning                                                                                                                                                                                                                              |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `persona_invalid`                   | HARD     | Manifest fails JSON Schema validation. The persona MUST NOT load. The envelope SHOULD list every schema violation with field paths.                                                                                                  |
| `persona_extends_cycle`             | warning  | The `extends` chain re-enters a previously visited path. The persona loads with the local manifest only.                                                                                                                             |
| `persona_extends_depth_exceeded`    | warning  | The `extends` chain exceeds depth 8. The persona loads with the local manifest only.                                                                                                                                                 |
| `persona_extends_missing`           | warning  | The path referenced by `extends` does not exist. The persona loads with the local manifest only.                                                                                                                                     |
| `persona_appliesto_unresolvable`    | warning  | One or more `appliesTo[]` refs failed to resolve in the host's registries. The persona loads.                                                                                                                                        |
| `persona_identity_unresolvable`     | warning  | The `identity` ref failed to resolve in the host's identity registry. The persona loads.                                                                                                                                             |
| `persona_relationship_unresolvable` | warning  | One or more `relationships[].persona` refs failed to resolve. The persona loads.                                                                                                                                                     |
| `persona_redirect_unresolvable`     | warning  | One or more `boundaries.redirects[].to` refs failed to resolve. The persona loads.                                                                                                                                                   |
| `persona_boundary_erosion_attempt`  | advisory | A child manifest set `boundaries.refuses: []` (or another append-and-dedupe array) explicitly. The append-and-dedupe rule means the parent's entries remain; this is a hint that the author's intent may not match the merge result. |
| `persona_xref_cross_tenant`         | warning  | A cross-AIP ref points outside the persona's tenant scope. Host policy decides whether to honour.                                                                                                                                    |

The envelope shape:

```ts
type PersonaWarning = {
  code: string
  message: string
  path?: string // file path or field path
  cause?: unknown
}
```

Hosts that pipe persona-load events to a tracing/observability backend SHOULD
emit `code` as a span attribute keyed `persona.event.code` so warnings aggregate
cleanly across runtimes.

## Multi-language hosts

Hosts in non-TS languages follow the same contract with language-idiomatic
naming:

| Language                | Function name                                   | Schema dialect                 |
| ----------------------- | ----------------------------------------------- | ------------------------------ |
| TypeScript / JavaScript | `definePersona`                                 | JSON Schema or zod             |
| Python                  | `define_persona`                                | JSON Schema or pydantic        |
| Go                      | `DefinePersona`                                 | JSON Schema struct tags        |
| Rust                    | `define_persona` (free fn) or `Persona::define` | JSON Schema or `schemars`      |
| Java / Kotlin           | `definePersona` (static)                        | JSON Schema or jackson schemas |

A persona authored as `PERSONA.md` is loaded by any language's adapter — the
manifest is the same across all of them. The code-side `definePersona`
constructor is host-idiomatic; the file-side manifest is universal.

## Registration test

A conforming host SHOULD provide a `validatePersona(manifestPath)` helper that:

1. Parses the manifest.
2. Validates frontmatter against `PERSONA.schema.json`.
3. Walks the `extends` chain and reports cycle/depth/missing warnings.
4. Resolves every cross-AIP ref and reports resolution warnings.
5. Returns the merged effective config + resolution chain + warnings list.

This is the standard "is this persona installable?" handshake. A host's CLI
SHOULD expose `agentproto validate ./PERSONA.md` that calls this helper and
prints a structured diagnostic.

## Loader rules

The manifest file MUST be safely loadable as a side-effect-free unit.
Specifically:

- **No I/O at parse time** beyond reading the manifest and its ancestors.
  Cross-AIP refs are resolved against the host's registries; they MUST NOT
  trigger arbitrary network or filesystem calls.
- **No reliance on a running host singleton** for parsing. The parser MUST work
  when invoked in isolation — for testing, schema export, doc generation. Host
  context arrives at registration time.
- **Default file extension is `.md`.** The manifest's filename MUST be
  `PERSONA.md` for filesystem discovery; the loader MAY accept `*.persona.md`
  for collocation patterns where personas live next to other artifacts.

## What this guide does NOT cover

- **Layered behavioural substance** — that's [AIP-23](/docs/aip-23) IDENTITY
  territory. A persona MAY ref an identity for substance; the identity
  workspace's loader is documented in AIP-23's ADAPTER.
- **Locked-trait enforcement across multiple personas** — that's
  [AIP-24](/docs/aip-24) ASSEMBLY territory. An assembly seat may require its
  persona's `boundaries.refuses` to include certain topics before the seat will
  accept the persona; the assembly loader enforces those checks.
- **Persona registry implementation** — in-memory catalog, database-backed
  catalog, distributed registry. AIP-25 declares the manifest shape; the
  registry is a host-policy concern.
- **The host's invocation surface** — how the persona's effective config is
  wired into the agent's prompt, how the body prose is formatted into the system
  message, how the avatar is rendered. These are runtime-policy concerns and
  stay out of the spec on purpose.
- **Prompt-injection defences on body prose** — the body is passed verbatim into
  agent context; injection defences are a host-policy concern. AIP-25 makes
  injection auditable (the body is in version control) but does not filter prose
  at the manifest layer.

## See also

- [AIP-25 — PERSONA.md spec](/docs/aip-25)
- [AIP-3 — SKILL.md](/docs/aip-3) — sibling single-doc AIP
- [AIP-23 — agentidentity/v1](/docs/aip-23) — heavy substance sibling
- [AIP-24 — agentassemblies/v1](/docs/aip-24) — composes personas as members
- [`./PERSONA.schema.json`](./PERSONA.schema.json) — manifest validator
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference manifests
- [`./skills/author-persona/SKILL.md`](./skills/author-persona/SKILL.md) —
  agent-side authoring skill
