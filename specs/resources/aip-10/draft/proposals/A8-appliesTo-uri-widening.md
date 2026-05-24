# AIP-10 Amendment A8 — `appliesTo` URI scheme widening for org/guild/role/user scoping

**Status:** Proposed
**Author:** jeremy@agentik.net
**Related:** [agentcorpus scoping model](https://agentproto.sh/docs/corpus#scoping-model)
**Strictly additive:** yes (widens an existing pattern; existing values keep validating)

## Motivation

AIP-10 entries and sources already carry `appliesTo: string[]` to express relevance scope. The current pattern accepts:

```
^ws://(operators|companies|skills)/<slug>$
| <relative-path>
```

This is too narrow for real org-tenant deployments. Corpora live inside guilds inside orgs; users carry roles; org-level shared corpora need to mark entries with cross-guild scope. Without a wider URI scheme, every scoping decision is shoehorned into a relative-path hack or `metadata.corpus.scope[]` denormalization.

## Evidence of pain

- **Marketing preset** entries carry `appliesTo: [ws://operators/marketing-analyst]` today, which validates, but as soon as we want a guild-wide entry we have to invent a new URI form or drop the field entirely.
- **CorpusAdapterCore scope-policy middleware** (planned M10/A8 work) needs to match `appliesTo` against the caller's identity tree, which already includes `ws://orgs/*`, `ws://guilds/*`, `ws://workspaces/*`, `ws://roles/*`, `ws://users/*` (see `IdentityPort.resolve()` in `projects/agentproto/ts/packages/corpus/src/ports/identity.port.ts`).
- **Org-level corpus federation** (acme-org/corpus extended by each guild) only works if entries can declare `appliesTo: [ws://orgs/acme-corp]` AND `appliesTo: [ws://guilds/acme-sales]` without leaving the AIP-10 contract.

## Proposed amendment

Widen the `appliesTo` item pattern in `KNOWLEDGE.schema.json`:

```json
{
  "appliesTo": {
    "type": "array",
    "items": {
      "type": "string",
      "anyOf": [
        {
          "pattern": "^ws://(orgs|guilds|workspaces|roles|operators|users|companies|skills)/[a-z][a-z0-9-]*[a-z0-9]?$"
        },
        {
          "pattern": "^(\\.\\./|\\./|[a-z0-9])"
        }
      ]
    }
  }
}
```

Examples that newly validate:

```yaml
appliesTo:
  - ws://orgs/acme-corp                # org-wide
  - ws://guilds/acme-marketing         # guild-scoped
  - ws://roles/senior-sales-rep        # role-scoped (AIP-47 ROLE refs)
  - ws://users/sarah                   # operator-as-user
```

Existing entries with `ws://operators/marketing-analyst` or `entries/principles/foo.md` keep validating — the new pattern is a superset.

## Matching semantics

Out of band, the corpus runtime matches `appliesTo` against the caller's identity tree (set intersection). The amendment only changes which URIs are spelled-legal — it does not prescribe a matching algorithm, leaving room for AIP-10 hosts to add their own scope-resolution layer.

## Reuse

Same pattern is useful in AIP-12 PLAYBOOK `targets[].ref` (organic targeting beyond operators), AIP-9 OPERATOR `governance.scope`, and AIP-18 COLLECTION cross-references. We can land A8 standalone, then refactor those references to share the URI subschema in a follow-up amendment.

## Migration

Strictly additive — no migration required. The widening is at the JSON Schema level; existing fixtures continue to validate untouched.

## Acceptance gate

- [x] Evidence-of-pain: corpus marketing preset
- [ ] Two consumers: needs a second corpus consumer using org-/guild-level scope
- [x] Strictly additive (no migration)
- [x] Migration helper: not needed
- [ ] AgentProto WG signoff
