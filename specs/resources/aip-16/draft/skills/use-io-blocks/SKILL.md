---
schema: skills/v1
name: use-io-blocks
title: Wire AIP-16 IO blocks into a new manifest format
description:
  Walk an adapter implementer through importing the four IO blocks (`inputs`,
  `outputs`, `inputsFiles`, `outputsFiles`) and the `defineIO` standard
  signature into a new AIP manifest format.
version: 1.0.0
tags: [aip-16, io, schema, adapter, agentproto]
inputs:
  - name: targetManifest
    type: string
    required: true
    description:
      The new manifest format being authored (e.g. "PROCEDURE.md", "AGENT.md").
      The skill produces the IO `$ref` plumbing for THAT manifest's schema.
  - name: hostLanguage
    type: string
    required: false
    description:
      Target language for the `defineIO` host implementation. Default "ts".
      Accepts "ts", "py", "go", "rs".
  - name: existingSchemaPath
    type: string
    required: false
    description:
      Absolute path to the new manifest's `*.schema.json`. If omitted, the skill
      produces the field rows + `$ref` snippets you paste in.
examples:
  - input:
      targetManifest: PROCEDURE.md
    output:
      - resources/<aip>/draft/PROCEDURE.schema.json (with $ref into
        IO.schema.json)
      - <aip>.mdx field-table rows for inputs / outputs / inputsFiles /
        outputsFiles
---

# Wire AIP-16 IO blocks into a new manifest format

Use this skill when you're authoring a NEW manifest format AIP and need to
declare what flows in and out. The four IO blocks (`inputs`, `outputs`,
`inputsFiles`, `outputsFiles`) are defined once in [AIP-16](/docs/aip-16) and
reused across every manifest type that runs code. Don't re-declare them;
reference them.

This skill is for **AIP authors and host implementers**, not end users — `IO.md`
is not a file users author. It's a schema block.

## When to use

- "I'm drafting a new AIP for declaring agent prompts and need to say what
  arguments come in."
- "My new manifest type needs the file-staging contract from workflows."
- "I'm building a host that consumes both TOOL.md and a custom manifest — make
  sure the IO surface is identical."

## When NOT to use

- The user wants to author a TOOL.md or WORKFLOW.md → use
  [`author-tool`](../../../aip-14/draft/skills/author-tool/SKILL.md) or
  [`author-workflow`](../../../aip-15/draft/skills/author-workflow/SKILL.md).
- The user wants to **change** how IO works in an existing AIP — that's a spec
  amendment, not a wiring task.

## Process

### 1. Decide which blocks your manifest needs

| Block          | Use it when…                                              |
| -------------- | --------------------------------------------------------- |
| `inputs`       | The body takes structured arguments. Almost always yes.   |
| `outputs`      | The body returns a structured result. Almost always yes.  |
| `inputsFiles`  | The body reads files from the user's workspace. Optional. |
| `outputsFiles` | The body writes files back to the workspace. Optional.    |

A manifest that only has structured I/O (no files) declares two blocks; one with
full file staging declares all four. Each block is independent — declaring
`inputsFiles` does NOT require `outputsFiles`.

### 2. Add the field rows to your manifest's frontmatter spec

Copy these into the field tables in your AIP `.mdx`:

```md
| `inputs` | JSON Schema | The IO `inputs` block defined by
[AIP-16](/docs/aip-16). | | `outputs` | JSON Schema | The IO `outputs` block
defined by [AIP-16](/docs/aip-16). | | `inputsFiles` | object | The IO
`inputsFiles` block defined by [AIP-16](/docs/aip-16). | | `outputsFiles` |
object | The IO `outputsFiles` block defined by [AIP-16](/docs/aip-16). |
```

If you only use a subset, drop the rows you don't need.

### 3. `$ref` into the published schema

In your manifest's `*.schema.json`:

```json
{
  "properties": {
    "inputs": {
      "$ref": "https://agentproto.dev/schemas/aip-16/IO.schema.json#/$defs/inputs"
    },
    "outputs": {
      "$ref": "https://agentproto.dev/schemas/aip-16/IO.schema.json#/$defs/outputs"
    },
    "inputsFiles": {
      "$ref": "https://agentproto.dev/schemas/aip-16/IO.schema.json#/$defs/inputsFiles"
    },
    "outputsFiles": {
      "$ref": "https://agentproto.dev/schemas/aip-16/IO.schema.json#/$defs/outputsFiles"
    }
  }
}
```

Do NOT redeclare `fileContractEntry` or `jsonSchema` in your own schema — `$ref`
carries them.

### 4. Add the requires clause

```yaml
requires: [..., 16]
```

Plus the markdown table row:

```md
| Requires | …, [AIP-16](/docs/aip-16) |
```

### 5. Write a one-paragraph reference (not a re-spec)

Don't reproduce AIP-16's lifecycle / path interpolation / error semantics in
your AIP. Write a short paragraph that:

1. States your manifest imports the IO contract from AIP-16.
2. Names the manifest-specific bindings: which run identifier keys the scratch
   root, what your `<XxxId>` interpolation token is called, how bodies access
   `_workflowFsRoot` in your host idiom.

Reference shape (steal verbatim, edit names):

```md
### Inputs / outputs / file contract

The four IO blocks `inputs`, `outputs`, `inputsFiles`, and `outputsFiles` follow
the contract defined in [AIP-16](/docs/aip-16) — the lifecycle, the reserved
`_workflowFsRoot` input field, the path interpolation tokens, and the error
semantics are normative there.

<TARGET>-specific bindings:

- The run identifier used to key the scratch root is the <TARGET>'s
  `<runId-name>`.
- The path interpolation token `<<targetId>>` is the <TARGET> manifest's `id`.
- Bodies access the scratch root via `inputData._workflowFsRoot` (the standard
  reserved key — name fixed for cross-manifest portability).
```

### 6. Wire `defineIO` into your host

Your host's `defineXxx` (defineTool, defineWorkflow, defineProcedure, …) calls
`defineIO` internally:

```ts
import { defineIO } from "<host-package>"

export function defineMyManifest(def) {
  const io = defineIO({
    inputs:       def.inputs,
    outputs:      def.outputs,
    inputsFiles:  def.inputsFiles,
    outputsFiles: def.outputsFiles,
  })
  // ... your manifest-specific assembly
  return {
    ...,
    inputSchema:  io.inputs,           // already augmented with _workflowFsRoot when files declared
    outputSchema: io.outputs,
    inputsFiles:  io.inputsFiles,
    outputsFiles: io.outputsFiles,
    validateInput: io.validateInput,
  }
}
```

The host's run lifecycle then:

1. Stages `io.inputsFiles` from the workspace before the body runs.
2. Calls `io.validateInput(userInput)` — `_workflowFsRoot` already in the
   schema.
3. Runs the body with `{ ...userInput, _workflowFsRoot: fsRoot }`.
4. Syncs `io.outputsFiles` after.

### 7. Validate

Run your `*.schema.json` through a JSON Schema validator with the AIP-16 schema
resolvable. Most validators handle `$ref` to `https://` URLs out of the box; for
offline development, host the IO schema locally and rewrite the `$ref` host.

## Output

A new manifest format that:

1. Has `inputs`, `outputs`, `inputsFiles`, `outputsFiles` rows in its
   frontmatter table referencing AIP-16.
2. Has those four fields in its schema as `$ref`s into IO.schema.json.
3. Has a one-paragraph "Inputs / outputs / file contract" section pointing to
   AIP-16 with manifest-specific bindings.
4. Lists `16` in `requires:`.
5. Has a host implementation whose `defineXxx` delegates the four IO fields to
   `defineIO`.

## See also

- [AIP-16 — IO blocks spec](/docs/aip-16)
- [`../IO.schema.json`](../../IO.schema.json) — schema validator
- [`../ADAPTER.md`](../../ADAPTER.md) — host implementer's guide
- [AIP-14 author-tool skill](../../../aip-14/draft/skills/author-tool/SKILL.md)
  — example consumer
- [AIP-15 author-workflow skill](../../../aip-15/draft/skills/author-workflow/SKILL.md)
  — example consumer
