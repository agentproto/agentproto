---
schema: skills/v1
name: author-persona
title: Author a PERSONA.md (AIP-25)
description:
  Walk through authoring a portable PERSONA.md manifest for a single agent
  persona — identity, backstory, voice, boundaries, locale, relationships,
  cross-AIP bindings, and body prose. The persona is the public face of an agent
  (name, voice, lore, refusals); inner behavioural substance belongs in an
  AIP-23 identity workspace, not here. This skill IS itself a valid AIP-3 skill
  — eat the dogfood.
version: 1.0.0
tags: [aip-25, persona, authoring, manifest, agentproto]
inputs:
  - name: characterBrief
    type: string
    required: true
    description:
      One-paragraph description of the persona to author. Who they are, what
      voice they have, what they refuse. The skill turns this into name + title
      + description + backstory + voice + boundaries.
  - name: extendsParent
    type: string
    required: false
    description:
      Optional path or ws:// ref to a parent PERSONA.md to extend. If set, the
      new persona is a variant; if omitted, the persona is standalone.
  - name: identityRef
    type: string
    required: false
    description:
      Optional ws:// ref to an AIP-23 identity workspace for the persona's inner
      substance. Use when the persona needs more than surface voice.
  - name: existingFolder
    type: string
    required: false
    description:
      Absolute path to a folder to author into. If omitted, the skill produces a
      new folder under personas/<name>/.
examples:
  - input:
      characterBrief:
        "A warm, patient cartographer named Marcus who has spent forty years
        mapping a fictional port city. Wry, methodical, distrusts the merchant
        council. Refuses quick policy answers."
    output:
      - personas/marcus-fenwick/PERSONA.md
---

# Author a PERSONA.md (AIP-25)

Use this skill when the user asks to **build, draft, author, or define a
persona** — a portable character file capturing the public face, voice,
backstory, and declared boundaries of an agent character. The skill produces a
valid [AIP-25 PERSONA.md](/docs/aip-25) manifest.

## When to use

- "Make a persona for our brand voice."
- "Write a Marcus character — warm, wry, distrusts the merchant council."
- "Wrap our therapist mentor as a persona file we can ship across products."
- "Create a junior variant of the Marcus persona."

## When NOT to use

- The user wants **layered behavioural substance** (cognitive style, decision
  posture, value system) → use the
  [AIP-23 identity-authoring skill](../../../aip-23/skills/author-identity/SKILL.md)
  instead. Personas are the _face_; identities are the _substance_.
- The user wants **a council, panel, or guild** of multiple characters → use the
  [AIP-24 assembly-authoring skill](../../../aip-24/skills/author-assembly-workspace/SKILL.md).
  An assembly composes multiple personas; this skill authors one.
- The user wants the agent to **load** an existing persona — no authoring
  needed; that's an adapter call, not a new artifact.

## Process

Eleven steps. The persona is one file; spend most of the time on the
frontmatter, then write the body prose last.

### 1. Fix identity

Five identity fields. All five are mandatory.

- **`schema: persona/v1`** — schema dispatch tag. Always set; hosts dispatch on
  it.
- **`name`** — kebab-case, 2–64 chars, descriptive of the character.
  (`marcus-fenwick`, not `persona-1`.)
- **`title`** — human display label, sentence case.
- **`description`** — one-paragraph elevator pitch. Tell the catalog who this
  persona is, what voice they carry, and when to use them. Vague descriptions
  produce wrong-persona picks.
- **`version`** — semver. `1.0.0` for first publish; bump on breaking change to
  identity, voice, or boundaries.

### 2. Decide: extend another persona, or fresh?

If `extendsParent` was provided, the persona is a variant — a "Marcus Junior"
extending Marcus. Set `extends:` to the parent's path. The variant inherits the
parent's signature phrases, tonality, refused topics, relationships, archetypes,
and tags via append-and-dedupe; the variant overrides scalar fields like
`voice.register` and `voice.formality`.

If `extendsParent` is empty, the persona is standalone — write every frontmatter
field from scratch.

A useful rule: if you find yourself overriding most of the parent's frontmatter,
the persona is NOT a variant. Author it standalone instead.

### 3. Avatar — the visual face

Set `avatar:` to a URL, data URI, or `ws://avatars/<slug>` ref. This is the
public face; the host renders it in the catalog and in conversation surfaces.
Optional — body-only personas omit it.

### 4. Backstory — the structured lore surface

The `backstory` block carries five optional fields:

- **`oneLineHook`** — punchy elevator hook (≤ 280 chars). The catalog shows this
  next to the persona name.
- **`background`** — long-form lore prose, in markdown. The character's history,
  motivations, and context. Optional in the frontmatter; many authors put the
  long lore in the body's `## Background` section instead.
- **`archetypes`** — categorical labels (kebab-case strings). The catalog
  clusters by these. Common values: `mentor`, `craftsman`, `sentinel`,
  `apprentice`, `keeper-of-secrets`, `trickster`.
- **`era`** — free-form era label. Conventional values: `contemporary`,
  `timeless`, `<year>`, `<period>`. Use `fictional-<period>` for fictional
  settings.
- **`setting`** — free-form setting label. Conventional values: `real-world`,
  `fictional-<universe>`. Free-form to accept any setting.

Personas with rich lore set `oneLineHook` and `archetypes` in the frontmatter
(so the catalog can filter), then write the long prose in the body's
`## Background` section. Brand voices often skip `era` and `setting` — they're
contemporary real-world by default.

### 5. Voice — the public voice slice

The `voice` block is what makes a persona recognisable across turns. Six fields,
all optional:

- **`register`** — the overall voice register. Conventional values:
  `warm-direct`, `playful`, `terse`, `academic`. Custom values welcome.
- **`signaturePhrases`** — catchphrases the character uses. Append-and-dedupe
  under `extends`. Aim for 3–6 phrases that _only_ this character would say.
- **`tonality`** — tonal adjectives. Examples: `rigorous`, `encouraging`, `dry`,
  `warm`, `composed`, `methodical`. Append-and-dedupe under `extends`. Aim for
  3–5 adjectives.
- **`formality`** — integer 0..10, where 0 is extremely casual and 10 is
  extremely formal. Most personas land in 4–7.
- **`emojiUsage`** — `never`, `sparing`, or `frequent`. Brand voices for
  developer tools usually `never`; mentor voices usually `sparing`; some product
  personas `frequent`.
- **`signOff`** — the persona's close. Examples: `"—M."`, `"Yours, Marcus"`,
  `"Until next time"`. Optional.

The voice block is what hosts read when surfacing the persona in the agent's
prompt. Be concrete here; vague voice declarations produce a vague voice at
runtime.

### 6. Boundaries — what the persona declares about itself

The `boundaries` block is the persona's self-declared safety surface. Three
fields:

- **`refuses`** — topics the persona refuses outright. Append-and-dedupe under
  `extends`. Examples: `tax-advice`, `legal-advice`, `medical-advice`,
  `self-harm-encouragement`. The persona body SHOULD demonstrate the refusal
  posture in voice samples.
- **`defers`** — topics the persona defers to a specialist on.
  Append-and-dedupe. Examples: `pricing-questions` (defer to sales),
  `clinical-conditions` (defer to medical professional).
- **`redirects`** — topic-to-target redirects. Each redirect has a `topic`, a
  `to` (ws:// ref or relative path to another persona/operator/skill), and
  optional `notes`. Merge-by-`topic` under extends — child entries with same
  `topic` replace parent's.

Important: AIP-25 has **no one-way switches at the persona level**. Locked
traits across multiple personas are an [AIP-24](/docs/aip-24) ASSEMBLY concern.
The persona just declares its boundaries; the assembly enforces consistency
across multiple seated personas.

The append-and-dedupe rule for `refuses` and `defers` means a child persona
cannot SHRINK the parent's lists — the merge result preserves the parent's
entries. This is by design.

### 7. Locale — default and fallbacks

- **`defaultLocale`** — BCP-47 tag. Examples: `en`, `en-US`, `fr-FR`, `pt-BR`.
- **`multilingual`** — fallback locales. Append-and-dedupe under `extends`.

Optional. Personas without locale fields default to host policy.

### 8. Relationships — links to other personas

The `relationships` array carries named links to other personas in the registry.
Each entry has:

- **`persona`** — `ws://personas/<slug>` ref to another `persona/v1` manifest.
- **`kind`** — relationship kind. Conventional values: `mentor-of`, `peer-of`,
  `mentee-of`, `rival-of`, `partner-of`. Custom kinds welcome.
- **`notes`** — optional prose describing the relationship.

The host MAY surface a relationship graph in the catalog UI. Failed-to-resolve
refs surface as `persona_relationship_unresolvable` warnings, not errors.

Use relationships when the persona is part of a world (game, fiction, structured
ensemble). Skip them for standalone brand voices and helper personas.

### 9. Cross-AIP bindings

Three cross-AIP fields, all optional:

- **`identity`** — `ws://identities/<slug>` ref to an [AIP-23](/docs/aip-23)
  IDENTITY workspace. Use when the persona needs layered cognitive substance
  beyond surface voice. The persona is the _face_; the identity is the
  _substance_.
- **`appliesTo[]`** — bind this persona to specific consumers. Each entry is one
  of:
  - `ws://operators/<slug>` — bind to an [AIP-9](/docs/aip-9) operator
  - `ws://skills/<slug>` — bind to an [AIP-3](/docs/aip-3) skill
  - `ws://assemblies/<slug>/<member>` — bind to an [AIP-24](/docs/aip-24)
    assembly seat
- The `boundaries.redirects[].to` field also takes ws:// refs to personas,
  operators, or skills — for routing refused topics.

Use `appliesTo` when the persona is destined for a specific consumer (a council
seat, an operator, a skill). Skip it for generic personas that the host's policy
binds at runtime.

### 10. Tags — catalog clustering

`tags` is a flat array of lowercase kebab-case strings. The catalog clusters by
these. Aim for 4–6 tags covering:

- The **role** (`mentor`, `helper`, `voice`, `analyst`).
- The **domain** (`brand`, `fiction`, `research`, `support`).
- The **product or world** (`indigo`, `holdfast`, `simone`).
- The **archetype family** (`craftsman`, `sentinel`).

Avoid stop-word tags (`general`, `useful`, `agent`). They never help the catalog
disambiguate. Append-and-dedupe under `extends` — variants accumulate tags.

### 11. Body — the long-form prose

The body is markdown. Hosts pass it verbatim into the agent's character-prompt
slot at activation time. Recommended sections:

- **`## Background`** — long-form lore and history. The character-defining text
  the schema cannot capture.
- **`## Voice samples`** — 3–5 short snippets demonstrating tone, register,
  signature phrases. Authors find this is the fastest way to communicate voice
  to readers and to runtime hosts.
- **`## Do / Don't`** — concrete examples of in-character vs out-of-character
  responses. Pairs well with `boundaries.refuses` and `boundaries.defers`.
- **`## Notes`** — author-facing context. Why this persona exists, what the
  design intent was, what NOT to change without breaking the character.

Keep prose tight. Long bodies eat the agent's context window. Aim for 100–300
lines of body for a typical persona; rich fictional characters MAY go longer
when the lore demands.

### 12. Validate

Validate the manifest against
[`../../PERSONA.schema.json`](../../PERSONA.schema.json):

```bash
npx ajv validate -s ../../PERSONA.schema.json -d ./PERSONA.md
```

Fix every error before declaring success. Specifically check:

- `schema: persona/v1` is present.
- `name` matches the kebab-case pattern.
- `description` is non-empty (the catalog reads this).
- If `extends:` is set, the path ends in `PERSONA.md` and the parent file
  exists.
- Every `voice.signaturePhrases` entry is a non-empty string.
- Every `relationships[].persona` is a `ws://personas/<slug>` ref.
- `appliesTo[]` refs match the
  `ws://(operators|skills|assemblies/<slug>|personas)/<slug>` pattern.
- `tags` are lowercase kebab-case.

## Output

Produce one file in the chosen folder:

```
<folder>/
  PERSONA.md       # the manifest (always)
```

Reply to the user with:

1. The folder you wrote to.
2. A one-line summary of identity (`name@version`) and the top 3–5 tags so they
   can verify the catalog placement.
3. The `boundaries.refuses` list (or "no refusals declared") so they confirm the
   safety surface before installing.
4. The `identity` ref (or "no identity bound") so they know whether the persona
   stands alone or composes with an AIP-23 substrate.
5. **Open assumptions** — defaults you guessed (e.g. archetypes chosen, era
   inferred, locale set) the user might want to override.

Do NOT install or invoke the persona yourself. Authoring ends with the file
written; installation is a separate step the user (or another skill) initiates.

## See also

- [AIP-25 — PERSONA.md spec](/docs/aip-25)
- [AIP-3 — SKILL.md spec](/docs/aip-3) — sibling single-doc AIP
- [AIP-23 — agentidentity/v1](/docs/aip-23) — heavy substance sibling
- [AIP-24 — agentassemblies/v1](/docs/aip-24) — composes personas as members
- [`../../ADAPTER.md`](../../ADAPTER.md) — implementer's guide for hosts
- [`../../EXAMPLES.md`](../../EXAMPLES.md) — reference PERSONA.md files
  (minimal, brand voice, fictional character, composed via extends, bound to
  identity, mentor for assembly seat)
