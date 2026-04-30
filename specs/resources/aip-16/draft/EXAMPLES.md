# EXAMPLES.md — IO block reference patterns

Reference snippets showing how the four AIP-16 IO blocks (`inputs`, `outputs`,
`inputsFiles`, `outputsFiles`) appear inside concrete manifests. AIP-16 is a
schema-block AIP — there's no `IO.md` file users author. The blocks live inside
other manifests ([TOOL.md](/docs/aip-14), [WORKFLOW.md](/docs/aip-15),
forthcoming formats) via JSON Schema `$ref`.

Each example below shows the IO surface of a runnable unit. Authors should copy
the shape closest to their use case and edit field names; implementers can use
the same snippets to validate that `defineIO` returns the expected `IOHandle`
shape.

## Patterns covered

1. [Simple scalar inputs and outputs](#1-simple-scalar-inputs-and-outputs)
2. [Complex object I/O with constraints](#2-complex-object-io-with-constraints)
3. [File-input only (OCR-style)](#3-file-input-only-ocr-style)
4. [File-output only (image generation)](#4-file-output-only-image-generation)
5. [Mixed scalar plus file I/O (document translation)](#5-mixed-scalar-plus-file-io-document-translation)
6. [Batch outputs as an array of files](#6-batch-outputs-as-an-array-of-files)
7. [Reusing the IO block across AIPs (TOOL / WORKFLOW / SKILL)](#7-reusing-the-io-block-across-aips-tool--workflow--skill)

---

## 1. Simple scalar inputs and outputs

The minimum viable IO surface — `inputs` and `outputs`, both structured, no
files. The host validates the input against `inputs` before the body runs and
(optionally) the return value against `outputs` after.

```yaml
inputs:
  type: object
  properties:
    name:
      type: string
      minLength: 1
      maxLength: 80
      description: The name to greet. Must be non-empty.
  required: [name]
  additionalProperties: false

outputs:
  type: object
  properties:
    greeting:
      type: string
      description: A localized greeting addressed to `name`.
  required: [greeting]
  additionalProperties: false
```

**When to use.** Hello-world tools, lookups that take a key and return a value,
deterministic transforms over short strings. No files in or out — `inputsFiles`
and `outputsFiles` are absent (equivalent to `{}` per the schema). The
`_workflowFsRoot` reserved field is NOT injected because both file maps are
empty.

---

## 2. Complex object I/O with constraints

A search tool whose `inputs` carries non-trivial validation (numeric range,
enum, array bounds) and whose `outputs` returns a paginated list. Authors
describe constraints inline so JSON Schema validation (host-side, before the
body runs) catches malformed calls without burning the body's quota.

```yaml
inputs:
  type: object
  properties:
    query:
      type: string
      minLength: 1
      maxLength: 500
      description: The search query string. Trim whitespace before sending.
    limit:
      type: integer
      minimum: 1
      maximum: 50
      default: 10
      description: Maximum results to return. The body MAY return fewer.
    fields:
      type: array
      items:
        enum: [title, snippet, url, publishedAt, score]
      uniqueItems: true
      default: [title, snippet, url]
      description: Subset of fields to include in each result row.
    sortBy:
      enum: [relevance, recency]
      default: relevance
  required: [query]
  additionalProperties: false

outputs:
  type: object
  properties:
    results:
      type: array
      items:
        type: object
        properties:
          title: { type: string }
          snippet: { type: string }
          url: { type: string, format: uri }
          publishedAt: { type: string, format: date-time }
          score: { type: number, minimum: 0, maximum: 1 }
        required: [title, url]
    nextCursor:
      type: string
      description: Opaque pagination cursor. Empty/absent when no more pages.
    totalEstimate:
      type: integer
      minimum: 0
      description: Best-effort count of total matches.
  required: [results]
  additionalProperties: false
```

**When to use.** Any tool whose inputs need validation tighter than "is this a
string." The constraints (`minimum`, `maximum`, `uniqueItems`, `enum`) are part
of the host-enforced boundary; bodies receive parsed, validated input and don't
re-check. Per-field `description` is not optional — the LLM reads them when
deciding whether to call the tool.

---

## 3. File-input only (OCR-style)

A tool that takes a workspace file and returns extracted text. No structured
`inputs` (other than the host-injected `_workflowFsRoot`); all the actual data
flows in via `inputsFiles`.

```yaml
inputs:
  type: object
  properties:
    _workflowFsRoot:
      type: string
      description: Reserved — host-injected scratch root path.
    locale:
      type: string
      pattern: "^[a-z]{2}(-[A-Z]{2})?$"
      default: en
      description: BCP-47 locale hint for the OCR engine.
  additionalProperties: false

outputs:
  type: object
  properties:
    text:
      type: string
      description: Extracted plain text. Layout is flattened to reading order.
    confidence:
      type: number
      minimum: 0
      maximum: 1
    pages:
      type: integer
      minimum: 1
  required: [text, confidence]
  additionalProperties: false

inputsFiles:
  source:
    path: uploads/scan.png
    mode: ro
    contentType: image/png
```

**When to use.** OCR, image classification, audio transcription, PDF parsing —
anything whose primary input is a binary blob too big to inline. The host stages
`uploads/scan.png` from the workspace into `<fsRoot>/source` before the body
runs; the body reads `path.join(inputData._workflowFsRoot, "source")` and never
touches the workspace provider directly. Note the explicit `_workflowFsRoot`
field in `inputs.properties` — when `inputsFiles` is non-empty, the manifest's
`inputs` schema MUST allow it (the host's `defineIO` augments automatically, but
declaring it explicitly documents the contract).

---

## 4. File-output only (image generation)

The inverse — text in, file out. The tool produces an image; the host syncs it
back to a workspace path with `<isoDate>` and `<toolId>` interpolated at sync
time.

```yaml
inputs:
  type: object
  properties:
    _workflowFsRoot:
      type: string
    prompt:
      type: string
      minLength: 1
      maxLength: 2000
      description:
        Text-to-image prompt. The body forwards verbatim to the model.
    aspectRatio:
      enum: ["1:1", "16:9", "9:16", "4:3", "3:4"]
      default: "1:1"
    seed:
      type: integer
      minimum: 0
      description: Optional seed for reproducible generation.
  required: [prompt]
  additionalProperties: false

outputs:
  type: object
  properties:
    width: { type: integer, minimum: 1 }
    height: { type: integer, minimum: 1 }
    seed: { type: integer }
    model: { type: string }
  required: [width, height, model]
  additionalProperties: false

outputsFiles:
  image:
    path: generated/<toolId>/<isoDate>/<runId>.png
    mode: rw
    contentType: image/png
```

**When to use.** Anything that produces a binary artifact: image generation,
audio synthesis, PDF rendering, video clips. The body writes to `<fsRoot>/image`
(the key is the on-disk filename — no subdirectories), and the host syncs it to
`generated/<toolId>/2026-04-29/<runId>.png` with all three tokens replaced. The
structured `outputs` carries metadata (dimensions, seed used, model name) since
`outputsFiles` is "nice to have" by spec — the structured return is what's
mandatory.

---

## 5. Mixed scalar plus file I/O (document translation)

Both directions of the file contract plus a structured scalar input. The host
stages the source PDF, the body translates it, the host syncs the translated PDF
back. Realistic shape for any "transform a workspace file" tool.

```yaml
inputs:
  type: object
  properties:
    _workflowFsRoot:
      type: string
    targetLocale:
      type: string
      pattern: "^[a-z]{2}(-[A-Z]{2})?$"
      description: BCP-47 target locale (e.g. "fr", "es-MX").
    formality:
      enum: [auto, formal, informal]
      default: auto
      description: Tone hint for locales where it matters (de/ja/fr).
    glossaryId:
      type: string
      description:
        Optional glossary slug. The body resolves via a tool, not directly.
  required: [targetLocale]
  additionalProperties: false

outputs:
  type: object
  properties:
    sourceLocale: { type: string }
    pageCount: { type: integer, minimum: 1 }
    charactersBilled: { type: integer, minimum: 0 }
    glossaryHits: { type: integer, minimum: 0 }
  required: [sourceLocale, pageCount, charactersBilled]
  additionalProperties: false

inputsFiles:
  source:
    path: docs/source.pdf
    mode: ro
    contentType: application/pdf

outputsFiles:
  translated:
    path: docs/translated/<targetLocale-IS-NOT-A-VALID-TOKEN>/source.pdf
    mode: rw
    contentType: application/pdf
```

Wait — that path is wrong on purpose to call out a real gotcha. The spec's
interpolation token set is fixed: `<runId>`, `<workflowId>`, `<toolId>`,
`<isoDate>`. Author-supplied input values (like `targetLocale`) are NOT
expanded. The correct path would either be static or use one of the four allowed
tokens:

```yaml
outputsFiles:
  translated:
    path: docs/translated/<isoDate>/<runId>.pdf
    mode: rw
    contentType: application/pdf
```

If you need user-input-derived paths (e.g. the locale in the filename), do that
through a workspace-write tool inside the body, not via the file contract. The
contract's path interpolation is deliberately limited so a malicious or buggy
manifest can't construct arbitrary workspace paths from caller input.

**When to use.** Document transforms (translate, redact, summarise, re-format),
media re-encoding, model-quantisation steps — anywhere both a scalar parameter
AND a file flow in, both updated metadata AND a file flow out. Concrete pattern:
scalar parameter steers the body, file is the bulk payload, structured output is
metadata.

---

## 6. Batch outputs as an array of files

The spec is "one key = one file" by default (multi-file output under one key is
open question 3 in AIP-16). For batch shapes, declare each output file as its
own key. The output array in the structured `outputs` records what was actually
produced; the file contract syncs each one independently.

```yaml
inputs:
  type: object
  properties:
    _workflowFsRoot:
      type: string
    pageRange:
      type: object
      properties:
        from: { type: integer, minimum: 1 }
        to: { type: integer, minimum: 1 }
      required: [from, to]
  required: [pageRange]
  additionalProperties: false

outputs:
  type: object
  properties:
    pagesProduced:
      type: array
      items:
        type: object
        properties:
          pageNumber: { type: integer, minimum: 1 }
          fileKey: { type: string }
        required: [pageNumber, fileKey]
      description:
        One entry per page actually produced. Body fills, host doesn't infer.
  required: [pagesProduced]
  additionalProperties: false

inputsFiles:
  source:
    path: docs/large.pdf
    mode: ro
    contentType: application/pdf

outputsFiles:
  page-1:
    path: docs/pages/<runId>/page-1.png
    contentType: image/png
  page-2:
    path: docs/pages/<runId>/page-2.png
    contentType: image/png
  page-3:
    path: docs/pages/<runId>/page-3.png
    contentType: image/png
  page-4:
    path: docs/pages/<runId>/page-4.png
    contentType: image/png
```

**When to use.** Batch transforms with a small, known fan-out (splitting a PDF
into N pages, generating a fixed-size sprite sheet, rendering N variants of a
generation prompt). Each file gets its own `outputsFiles.<key>` entry; missing
files at sync time are warnings, not errors (the body's structured `outputs`
authoritatively lists what was produced). For large or unknown fan-out, model
the writes as a tool step with a workspace-write tool — the file contract is for
declared, predictable shapes.

> The four IO blocks deliberately do NOT model streaming or incremental outputs
> (open question 1 in AIP-16). A tool that produces results progressively today
> either returns a final batch or models the stream via tool calls back to the
> host.

---

## 7. Reusing the IO block across AIPs (TOOL / WORKFLOW / SKILL)

The same four blocks appear, byte-identically, in every importing manifest. This
is the value of AIP-16 — one schema, many homes. Below is the same conceptual
operation ("translate a workspace PDF") expressed three ways.

### As a TOOL.md (AIP-14) — single-call unit

```md
---
name: Translate PDF
id: translate-pdf
description:
  Translate a workspace PDF into the target locale. Single call; the host stages
  the source and syncs the result.
version: 1.0.0
entry: tool.ts
mutates: ["workspace:/docs/translated/*"]
requires:
  network: ["api.deepl.com"]
  secrets: ["deepl-api-key"]
approval: on-mutate
risk_level: 1
cost_class: metered
timeout_ms: 60000
inputs:
  type: object
  properties:
    _workflowFsRoot: { type: string }
    targetLocale: { type: string, pattern: "^[a-z]{2}(-[A-Z]{2})?$" }
  required: [targetLocale]
outputs:
  type: object
  properties:
    sourceLocale: { type: string }
    pageCount: { type: integer, minimum: 1 }
  required: [sourceLocale, pageCount]
inputsFiles:
  source:
    path: docs/source.pdf
    mode: ro
    contentType: application/pdf
outputsFiles:
  translated:
    path: docs/translated/<isoDate>/<runId>.pdf
    contentType: application/pdf
tags: [translation, pdf, file-contract]
---
```

### As a step inside a WORKFLOW.md (AIP-15)

The workflow declares the same four blocks at the top level for its own I/O, AND
each step's `inputs` / `outputs` follow the same shape. Step file contracts
inherit from the workflow's per-run scratch root — there's one `_workflowFsRoot`
shared across all steps in the run.

```md
---
name: Localise Doc Pipeline
id: localise-doc-pipeline
description:
  Translate a PDF, OCR-check the translation, write a quality report into the
  workspace.
version: 1.0.0
entry: workflow.ts
inputs:
  type: object
  properties:
    targetLocale: { type: string }
    _workflowFsRoot: { type: string }
  required: [targetLocale]
outputs:
  type: object
  properties:
    qualityScore: { type: number, minimum: 0, maximum: 1 }
    reportPath: { type: string }
  required: [qualityScore]
inputsFiles:
  source:
    path: docs/source.pdf
    contentType: application/pdf
outputsFiles:
  translated:
    path: docs/translated/<isoDate>/<runId>.pdf
    contentType: application/pdf
  report:
    path: reports/<workflowId>-<isoDate>.md
    contentType: text/markdown
steps:
  - id: translate
    kind: tool
    tool: translate-pdf
    inputs:
      targetLocale: $workflow.inputs.targetLocale
      _workflowFsRoot: $workflow.inputs._workflowFsRoot
    outputs:
      type: object
      properties:
        sourceLocale: { type: string }
        pageCount: { type: integer }
      required: [sourceLocale, pageCount]
    next: score
  - id: score
    kind: tool
    tool: translation-quality-score
    inputs:
      _workflowFsRoot: $workflow.inputs._workflowFsRoot
    outputs:
      type: object
      properties:
        qualityScore: { type: number }
        notes: { type: string }
      required: [qualityScore]
    next: $end
tags: [translation, pipeline]
---
```

The step `inputs` / `outputs` schemas follow the same JSON-Schema shape as the
standalone tool — that's not coincidence, it's the whole point. A host's
`defineWorkflow` calls `defineIO` once per step, plus once for the workflow's
own boundary, and gets uniform augmentation (`_workflowFsRoot`, default empty
maps) everywhere.

### As a SKILL.md (AIP-3) — agent skill that wraps the tool

SKILL.md uses a slimmer `inputs` shape today (a list of named parameters with
prose descriptions, not a full JSON Schema), but the underlying contract — what
flows in, what flows out — is the same. When a skill BINDS a tool, the tool's
`inputs` schema is the load-bearing one; the skill description is for the agent.

```md
---
schema: skills/v1
name: localise-document
title: Localise a workspace PDF
description:
  Translate a PDF in the user's workspace into the requested target locale.
version: 1.0.0
tags: [translation, document]
inputs:
  - name: targetLocale
    type: string
    required: true
    description: BCP-47 target locale (e.g. "fr", "es-MX", "ja-JP").
tools:
  - translate-pdf
examples:
  - input:
      targetLocale: fr
    output:
      sourceLocale: en
      pageCount: 12
---

# Localise a workspace PDF

Use this skill when the user asks to translate a document already in their
workspace at `docs/source.pdf`. Forward `targetLocale` to the `translate-pdf`
tool; the host handles file staging and sync.

The translated file is written to `docs/translated/<today>/<runId>.pdf`
automatically — surface that path back to the user when reporting completion.
```

The skill's structured `inputs` list is a lightweight projection of
`translate-pdf`'s `inputs` block — the agent reads the prose, the runtime calls
the tool, the tool's IO block carries the actual contract. Three AIPs, one IO
surface, no schema drift.

**When to use cross-AIP reuse.** Any time a single conceptual operation needs to
surface in multiple shapes — a Tool for single-call use, a Workflow when it
composes with other steps, a Skill when an agent should know to invoke it.
Authoring all three on one IO block (rather than three subtly different ones)
keeps agent reasoning, governance audits, and registry diff-checks honest.

---

## Anti-patterns to avoid

- **Adding an `error` field to `outputs`.** Errors are out-of-band per the
  importing manifest's error model. The IO block is success-case only. A tool
  that wants typed errors uses TOOL.md's error-table convention; a workflow uses
  step-level error hooks. Don't pollute `outputs` with an error union.
- **Pre-supplying `_workflowFsRoot` from the caller.** The host injects it; any
  value the caller pre-supplied is overwritten. Tests that try to "fake" the
  root by passing it in will silently see it replaced with the host's real
  per-run path. Stub the host's scratch-root provider in tests instead.
- **Constructing `outputsFiles.path` from author-controlled values.** The four
  interpolation tokens (`<runId>`, `<workflowId>`, `<toolId>`, `<isoDate>`) are
  the only ones expanded. `<targetLocale>` from inputs is NOT a token — it
  appears literally in the path. Use a workspace-write tool inside the body if
  you need input-derived paths; the workspace tool enforces path scoping the
  contract can't.
- **Declaring `inputsFiles` without allowing `_workflowFsRoot` in `inputs`.**
  When either file map is non-empty, the host injects `_workflowFsRoot: string`.
  If your `inputs` has `additionalProperties: false` and no explicit
  `_workflowFsRoot` property, validation fails before the body runs. `defineIO`
  augments automatically — but only if you go through it. Hand-rolled adapters
  that bypass `defineIO` are on their own.
- **One key, multiple files via subdirectory.** The spec is one key = one file.
  A body that writes `<fsRoot>/output/page-1.png`, `<fsRoot>/output/page-2.png`,
  … under a single `outputsFiles.output` key gets unpredictable sync behaviour
  (the host reads the path, not the directory). Declare one key per file
  (Example 6) or write through a tool.

## See also

- [AIP-16 — IO blocks spec](/docs/aip-16)
- [AIP-14 — TOOL.md](/docs/aip-14) — primary consumer
- [AIP-15 — WORKFLOW.md](/docs/aip-15) — primary consumer
- [AIP-3 — SKILL.md](/docs/aip-3) — sibling consumer (lighter inputs surface)
- [AIP-17 — RUNTIME.md](/docs/aip-17) — sibling schema-block AIP for execution
  mode
- [`./IO.schema.json`](./IO.schema.json) — schema validator
- [`./ADAPTER.md`](./ADAPTER.md) — host implementer's guide
- [`./skills/use-io-blocks/SKILL.md`](./skills/use-io-blocks/SKILL.md) —
  authoring skill
