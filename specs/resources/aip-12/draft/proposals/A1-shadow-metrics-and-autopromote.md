# AIP-12 Amendment A1 — Shadow metrics, traffic split, auto-promote gate

**Status:** Proposed
**Author:** jeremy@agentik.net
**Discussion:** [agentcorpus](https://agentproto.sh/docs/corpus) end-to-end shadow → active loop
**Strictly additive:** yes (no field hoisted today; new optional fields)

## Motivation

The current AIP-12 PLAYBOOK has `status: shadow | active | archived` but no declarative way to:

1. Express **how much traffic** a shadow playbook receives.
2. Declare the **gate** under which `shadow → active` flips automatically.
3. Record **why** an archive happened (debugging, compliance, supersession).
4. Surface **shadow telemetry** so the curator UI can show the eval delta without sidecar files.

The `@agentproto/corpus` reference composition stashes all four under `metadata.corpus.*` today, validated against the shipped marketing preset
(`projects/agentproto/ts/packages/corpus-presets/marketing/`). Once a second consumer (sales preset, customer-bespoke corpus, etc.) needs the same fields, the acceptance criteria for a core hoist are met.

## Evidence of pain

- **Marketing preset** (`projects/agentproto/ts/packages/corpus-presets/marketing/`): 5 seed playbooks use `metadata.corpus.shadowMetrics`, `metadata.corpus.shadowTrafficPct`, `metadata.corpus.autoPromote`, and `metadata.corpus.archiveReason`. Validated by AIP-12's schema today because `metadata.corpus.*` is `additionalProperties: true`.
- **Curator UI** (`projects/guilde/apps/web/src/components/corpus/CorpusPage.tsx`): the playbooks panel reads these fields to render the "shadow metrics" card and the activate/archive controls. Each consumer would have to know to look inside `metadata.corpus` until the hoist lands.
- **Promotion gate** (`projects/agentproto/ts/packages/corpus/src/playbooks/lifecycle.ts`): the activation path consults `metadata.corpus.autoPromote.threshold` and `metadata.corpus.shadowMetrics.winRateVsBaseline` to decide whether `lc.activate()` is even legal. With the hoist, the runtime can validate the gate structure statically.

## Proposed amendment

Add the following optional top-level fields to `PLAYBOOK.schema.json`:

```json
{
  "shadow_traffic_pct": {
    "type": "number",
    "minimum": 0,
    "maximum": 1,
    "default": 0.1,
    "description": "Fraction of operator traffic routed through the shadow overlay while status=shadow. Ignored when status≠shadow."
  },
  "auto_promote": {
    "type": "object",
    "additionalProperties": false,
    "description": "Declarative gate the runtime evaluates to flip shadow → active.",
    "properties": {
      "enabled": { "type": "boolean", "default": true },
      "metric": {
        "type": "string",
        "description": "Name of a shadow_metrics key (or evidence.eval-case metric) the gate watches."
      },
      "threshold": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "gte": { "type": "number" },
          "lte": { "type": "number" }
        }
      },
      "min_sample_size": { "type": "integer", "minimum": 1, "default": 30 },
      "cooldown": {
        "type": "string",
        "pattern": "^P(?:\\d+Y)?(?:\\d+M)?(?:\\d+W)?(?:\\d+D)?(?:T(?:\\d+H)?(?:\\d+M)?(?:\\d+S)?)?$"
      }
    }
  },
  "archive_reason": {
    "type": "string",
    "minLength": 2,
    "maxLength": 500,
    "description": "Required when status=archived. Free-form text stored verbatim for audit (matches the corpus-curator UI's archive dialog input)."
  },
  "shadow_metrics": {
    "type": "object",
    "additionalProperties": false,
    "description": "Host-written telemetry produced by the playbook evaluator. Reset on shadow re-entry.",
    "properties": {
      "sample_size": { "type": "integer", "minimum": 0 },
      "win_rate_vs_baseline": { "type": ["number", "null"] },
      "last_evaluated_at": { "type": ["string", "null"], "format": "date-time" }
    }
  }
}
```

`status: archived` should become conditionally `required` on `archive_reason` via JSON Schema's `if/then`:

```json
{
  "if": { "properties": { "status": { "const": "archived" } } },
  "then": { "required": ["archive_reason"] }
}
```

## Migration

Strictly additive — playbooks that store these fields under `metadata.corpus.*` keep validating. A one-liner migrator hoists them:

```ts
function migratePlaybookV1ToV2(fm: PlaybookFrontmatter): PlaybookFrontmatter {
  const corpus = fm.metadata?.corpus
  if (!corpus) return fm
  const hoisted = {
    ...fm,
    ...(corpus.shadowTrafficPct !== undefined && { shadow_traffic_pct: corpus.shadowTrafficPct }),
    ...(corpus.autoPromote && { auto_promote: corpus.autoPromote }),
    ...(corpus.archiveReason && { archive_reason: corpus.archiveReason }),
    ...(corpus.shadowMetrics && {
      shadow_metrics: {
        sample_size: corpus.shadowMetrics.sampleSize,
        win_rate_vs_baseline: corpus.shadowMetrics.winRateVsBaseline,
        last_evaluated_at: corpus.shadowMetrics.lastEvaluatedAt,
      },
    }),
  }
  return hoisted
}
```

The runtime reads from the hoisted location preferentially, falls back to `metadata.corpus.*`, so deployments can migrate at their own pace.

## Acceptance gate

- [x] Evidence-of-pain: marketing preset
- [ ] Two consumers: sales preset (pending)
- [x] Strictly additive
- [x] Migration helper sketched above
- [ ] AgentProto WG signoff
