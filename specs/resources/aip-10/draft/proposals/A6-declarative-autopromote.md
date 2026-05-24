# AIP-10 Amendment A6 — Declarative `curation.autoPromote` policy

**Status:** Proposed
**Author:** jeremy@agentik.net
**Related:** [agentcorpus](https://agentproto.sh/docs/corpus) candidate lifecycle gate
**Strictly additive:** yes

## Motivation

`KNOWLEDGE.md` carries a free-form `curation` block today. The `@agentproto/corpus` reference composition relies on `metadata.corpus.autoPromote.requires` to decide whether a corpus candidate is allowed to flip from `analyzed → approved → entry`. Each consumer parses the block in its own way; the runtime can't validate it ahead of time and the curator UI can't render the gate as a form.

Hoisting the policy to a typed `curation.autoPromote` field lets:

1. The validator reject malformed policies at workspace boot, before any candidate is processed.
2. The promoter (`@agentproto/corpus/src/lifecycle/gate.ts`) consume the policy without per-host parsing.
3. The curator UI render the gate as a form (Settings page, M13.7) instead of free-text YAML.

## Evidence of pain

- **Marketing preset** uses `metadata.corpus.autoPromote.requires` with the structure documented below; the gate evaluator at `gate.ts:18-110` already mirrors this shape internally.
- **CorpusPromoter** (`projects/agentproto/ts/packages/corpus/src/lifecycle/promote.ts`) reads `KNOWLEDGE.md` at every promotion and parses the gate ad-hoc.
- **Curator dashboard settings** (planned M13.7) needs the typed policy to render activate/promote thresholds as form fields rather than asking curators to edit YAML.

## Proposed amendment

Add the following to `KNOWLEDGE.schema.json` under the existing `curation` slot:

```json
{
  "curation": {
    "type": "object",
    "additionalProperties": true,
    "properties": {
      "autoPromote": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "enabled": { "type": "boolean", "default": false },
          "when": { "$ref": "#/$defs/policyExpression" }
        },
        "required": ["when"]
      }
    }
  },
  "$defs": {
    "policyExpression": {
      "oneOf": [
        { "$ref": "#/$defs/policyAll" },
        { "$ref": "#/$defs/policyAny" },
        { "$ref": "#/$defs/policyCondition" }
      ]
    },
    "policyAll": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "all": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/policyExpression" } }
      },
      "required": ["all"]
    },
    "policyAny": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "any": { "type": "array", "minItems": 1, "items": { "$ref": "#/$defs/policyExpression" } }
      },
      "required": ["any"]
    },
    "policyCondition": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "field": { "type": "string", "minLength": 1 },
        "gte": { "type": "number" },
        "lte": { "type": "number" },
        "equals": {},
        "minItems": { "type": "integer", "minimum": 0 },
        "allPresent": { "type": "array", "items": { "type": "string" } }
      },
      "required": ["field"]
    }
  }
}
```

Example workspace policy:

```yaml
curation:
  autoPromote:
    enabled: true
    when:
      all:
        - { field: metadata.corpus.qualityScore, gte: 4.2 }
        - { field: metadata.corpus.riskScore,    lte: 1.5 }
        - { field: sources, minItems: 1 }
        - { field: metadata.corpus.requiredFields, allPresent: [why_it_works, transferable_pattern, use_when, avoid_when] }
        - { field: metadata.corpus.restricted, equals: false }
```

## Reuse

This policy expression subschema is reusable. AIP-12 A1's `auto_promote` could adopt the same `policyExpression` shape for its gate (`metric` + `threshold` becomes a single `when` clause). AIP-18 status-transition gates likewise.

## Migration

- Existing `metadata.corpus.autoPromote` blocks: the host reads either location.
- Migration helper `migrateKnowledgeV1ToV2(fm)` moves the block when present.

## Acceptance gate

- [x] Evidence-of-pain: marketing preset KNOWLEDGE.md
- [ ] Two consumers: sales preset (pending)
- [x] Strictly additive (curation already `additionalProperties: true`)
- [x] Migration helper sketched
- [ ] AgentProto WG signoff
