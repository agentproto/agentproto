# ADAPTER.md — implementing AIP-12 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, weave, and evolve** AIP-12 [`PLAYBOOK.md`](/docs/aip-12)
overlay fragments. It is normative for the parts marked MUST and informative for
the parts marked SHOULD.

The audience is a runtime author — someone exposing `definePlaybook` to playbook
authors and weaving overlays into operator personas ([AIP-9](/docs/aip-9)) at
session compose time. Playbook authors themselves should read
[`./SKILL.md`](./SKILL.md), not this file.

## Contract overview

A conforming host implements five responsibilities:

1. **Parse the manifest** — read `PLAYBOOK.md`, validate against
   [`./PLAYBOOK.schema.json`](./PLAYBOOK.schema.json), surface errors with
   file + field path.
2. **Load the entry** — `import` (or language-equivalent) the file referenced by
   `entry`. The entry's default export is a value produced by
   `definePlaybook(...)`.
3. **Reconcile** — verify the entry's metadata matches the manifest's
   frontmatter (slug, targets, kind, lockCheck). Mismatch is a spec bug.
4. **Weave at compose time** — at the start of every operator session, resolve
   `targets[]` matches, run lock-check, weave the overlays into the persona in
   priority order.
5. **Apply deltas** — when a reflection loop produces a delta, write a new
   `PLAYBOOK.md` at `status: shadow`, append a `history` entry, never
   auto-promote.

The signature `definePlaybook` is the boundary between the host and the author.
The host MAY internally translate to its own playbook type after registration,
but the signature is what authors call.

## `definePlaybook` — declare a single overlay

### Required behaviour

A host that implements `definePlaybook` MUST:

1. **Accept the `PlaybookDefinition` shape** documented in
   [AIP-12 § PLAYBOOK.md shape](/docs/aip-12#playbookmd-shape). Both
   `kind: "overlay"` and `kind: "block-replacement"` MUST be supported.
2. **Reject unknown kinds at registration**, with a clear error. Hosts MAY add
   proprietary kinds, but they live OUTSIDE the standard signature and never
   affect cross-host portability.
3. **Defer weaving to compose time.** `definePlaybook(...)` MUST NOT modify any
   persona during registration; it returns a handle the weaver invokes per
   session.
4. **Validate kind-specific fields.** A `kind: "block-replacement"` playbook
   MUST name the block to swap; the host MUST refuse if the target persona
   doesn't expose that block as replaceable.

### Optional behaviour

A host MAY:

- Re-export `definePlaybook` under host-idiomatic aliases (`playbook`,
  `createPlaybook`). The canonical name MUST be present.
- Attach host-specific tracing tags to the returned handle.
- Cache the parsed manifest keyed by file mtime for hot-reload.

## Loader

The loader walks a `playbooks/` directory and registers every `PLAYBOOK.md` it
finds. The directory layout is open (`role/`, `operator/`, flat) — the loader
keys playbooks by `slug`, not by filesystem path.

Required loader behaviour:

1. **Read the manifest**, parse the YAML frontmatter, validate against the
   schema.
2. **Read the entry** (`entry` field, default `playbook.ts`). Reconcile entry vs
   manifest. Refuse on drift.
3. **Index by slug** in the catalog. Slugs MUST be unique within a playbooks
   directory; duplicates fail registration.
4. **Honour `status`.** Only `active` playbooks weave; `shadow` and `archived`
   are loaded but not woven.
5. **Regenerate `_index.md`** on every write so a human can audit the active
   set.

The loader MUST surface, for every registered playbook: `slug`, `title`,
`targets`, `status`, `priority`, `lock_check`, `updated_at`.

## Persona composition pipeline

Composition runs once per agent session, before the agent generates its first
turn:

1. **Resolve operator.** Look up the active operator's persona per
   [AIP-9](/docs/aip-9). Read its locked-trait list (`persona.locks`).
2. **Match playbooks.** Walk the playbooks catalog; collect every `active`
   playbook whose `targets[]` matches the operator (by exact slug, glob, role
   membership, or skill membership).
3. **Sort.** Descending by `priority`, then descending by `updated_at`. Ties are
   deterministic — a session compose with the same inputs MUST produce the same
   persona.
4. **Lock-check (per playbook, per match).** For each candidate, reject if the
   body would modify any trait in the operator's locked-trait list (declared OR
   runtime-enforced).
5. **Weave.** For `kind: "overlay"`, append the body to the persona at the
   operator's overlay slot. For `kind: "block-replacement"`, swap the named
   block. The order of weaving follows the sort order.
6. **Hand off.** The composed persona feeds the agent for this session.
   Subsequent turns reuse it; the host MAY recompose on a long-lived session if
   playbooks change mid-session.

Hosts MUST emit a `playbooks.composed` audit event per session listing every
playbook that wove and every one that was rejected (with reason).

## Locked-trait enforcement

This is the safety surface. Get it right and self-improvement is deployable; get
it wrong and a faulty evolution loop overwrites the operator's identity.

### Two-layer enforcement

Per the spec, lock-checking runs at **both** layers and the **host MUST reject
deltas that violate either**:

1. **Author intent** — the playbook's `lock_check[]` declares which traits the
   author committed not to modify. The host MUST treat this as the _minimum_
   lock set for that playbook.
2. **Runtime enforcement** — the runtime maintains its own list of locked traits
   per operator (read from [AIP-9](/docs/aip-9) `persona.locks`). The host MUST
   union it with the author list and apply both.

Stricter wins. A trait locked by either layer is locked. There is no "override"
knob for normal operation; bypassing the lock requires a deliberate persona edit
([AIP-9](/docs/aip-9)), not a playbook.

### How to actually check

The host MUST run a body-level lock-check, not just frontmatter match.
Recommended pipeline:

1. **Rule-based pass.** Substring / regex matches against forbidden patterns the
   runtime curates (e.g. an overlay declaring `lock_check: ["warmth"]` MUST NOT
   contain phrases like "act cold", "skip pleasantries"). Cheap, fast, blocks
   the obvious smuggle.
2. **LLM-judge pass (SHOULD).** A small classifier reads the body plus the
   operator's locked-trait definitions and answers "does this overlay modify any
   locked trait?" The judge MUST default to reject on ambiguous output.
3. **Compose-time veto.** Even if a playbook passed registration checks, the
   host MAY re-run the judge at compose time per operator (different operators
   may have different locks).

A playbook that fails lock-check at any layer MUST NOT weave. The host MUST emit
a `playbook.rejected` audit event with `slug`, `operator`, `reason`, `trait`,
and an excerpt of the offending body.

### Delta rejection

When a reflection loop submits a delta, the host MUST run lock-check **before
writing the file to disk**. A rejected delta:

- MUST NOT produce a `PLAYBOOK.md` on disk.
- MUST be logged in `_log.md` with the delta source, the violated trait, and the
  offending excerpt.
- SHOULD be returned to the reflection loop as a typed error so subsequent
  passes can avoid the same misfire.

This is the hardest contract in the AIP. Hosts that skip delta-time lock-check
and rely only on compose-time rejection produce a steadily growing pile of
broken playbooks on disk — the `status: shadow` queue becomes a tarpit.

## Delta application pipeline

A reflection loop produces 0..N candidate deltas per pass. The host processes
them as follows:

1. **Receive.** The loop emits a structured delta with `target`, `body`,
   `evidence`, and `proposed_kind`. The host parses it; a malformed delta is
   rejected with `delta_invalid`.
2. **Lock-check.** Run the two-layer check above. Rejected deltas stop here.
3. **Write at shadow.** Write a new `PLAYBOOK.md` with `status: shadow`,
   generate a fresh `slug` (kebab-case, derived from the body's verb-phrase,
   suffixed with a short hash to avoid collisions), and append the delta to the
   playbook's `history[]`.
4. **Index.** Regenerate `_index.md`. Emit `playbook.shadowed` audit event.
5. **Accumulate evidence.** Each session that _would have_ woven the shadow
   playbook accumulates a counterfactual — the host logs what the persona would
   have looked like and (optionally) a scorer evaluation of the resulting
   hypothetical output.
6. **Promote — separate gate.** Promotion to `active` is NOT automatic. It
   happens via:
   - **A/B test** with measurable improvement, OR
   - **Human approval** for low-impact overlays, OR
   - **AIP-7 governance** for high-impact overlays (anything with
     `priority >= 75` or affecting safety-tagged operators). On promotion, the
     host MUST append a new `history[]` entry describing the gate that passed.
7. **Archive on supersede.** If the new playbook lists `supersedes: [<slug>]`,
   the host MUST set the predecessor to `archived` on activation. Archived
   playbooks remain on disk; weaving stops.

### Append-only history

`history[]` is the audit trail. Once written, an entry MUST NOT be deleted or
rewritten. A correction is a _new_ entry that references the prior one. Hosts
MUST refuse writes that mutate prior history entries.

The current `PLAYBOOK.md` is the **materialised view** of its history — what the
runtime weaves. Reconstructing the playbook from its history MUST yield the same
body and metadata. This invariant is how operators audit drift: replay the
history, verify the materialised view matches.

## Apply-time event stream

The host MUST emit a structured event stream observable to [AIP-7](/docs/aip-7)
audit and downstream tracing:

| Event                 | When                                                     |
| --------------------- | -------------------------------------------------------- |
| `playbook.registered` | After loader writes a playbook to the catalog.           |
| `playbook.shadowed`   | A delta produced a new `status: shadow` playbook.        |
| `playbook.promoted`   | Status moved `shadow → active`.                          |
| `playbook.archived`   | Status moved to `archived` (TTL, supersede, or manual).  |
| `playbook.rejected`   | Lock-check failed at registration or delta time.         |
| `playbooks.composed`  | Per-session list of woven + skipped playbooks.           |
| `playbook.skipped`    | Per-session: a candidate failed compose-time lock-check. |

Hosts MAY add events; the seven above MUST be present.

## Error envelope

Errors emitted by the loader, weaver, and delta pipeline use the shared
agentproto error vocabulary:

| Code                    | Meaning                                                                      |
| ----------------------- | ---------------------------------------------------------------------------- |
| `playbook_invalid`      | Manifest fails schema validation.                                            |
| `entry_drift`           | Entry vs manifest mismatch.                                                  |
| `slug_duplicate`        | Two playbooks share a slug in the same directory.                            |
| `target_unresolved`     | A `targets[].ref` doesn't resolve.                                           |
| `lock_violated`         | Body modifies a locked trait — at registration, delta time, or compose time. |
| `block_not_replaceable` | `kind: "block-replacement"` names a block the persona doesn't expose.        |
| `history_mutation`      | Attempted write would modify a prior history entry.                          |
| `delta_invalid`         | Reflection loop emitted a malformed delta.                                   |
| `promotion_denied`      | Promotion gate failed (no A/B improvement, governance reject).               |

Each error MUST carry `code`, `message`, `playbook_slug?`, `operator?`, and (for
lock violations) `trait` and `excerpt`.

## Multi-language hosts

| Language                | Function names              | Schema dialect          |
| ----------------------- | --------------------------- | ----------------------- |
| TypeScript / JavaScript | `definePlaybook`            | JSON Schema             |
| Python                  | `define_playbook`           | JSON Schema             |
| Go                      | `DefinePlaybook`            | struct tags             |
| Rust                    | `define_playbook` (free fn) | JSON Schema or schemars |

The frontmatter format and the body are language-independent — only the
entry-file aliases vary.

## Persistence

Playbooks live on disk by design — this is a filesystem-first spec. Hosts MAY
index playbooks in a database for query speed, but the on-disk file MUST remain
the source of truth. Database drift is a spec violation.

`history[]` MAY be stored inside the manifest (small, recent) or externalised to
a sibling `<slug>.history.md` (long evolution chains). Either way, history is
append-only and reconstructable from disk.

## Registration test

A conforming host SHOULD provide a `validate(folderPath)` helper that:

1. Loads every `PLAYBOOK.md` under the folder.
2. Validates each against `PLAYBOOK.schema.json`.
3. Reconciles each entry against its manifest.
4. Resolves every `targets[].ref` against the operator catalog.
5. Runs lock-check (rule-based + LLM-judge) against the bodies.
6. Verifies `_index.md` matches the registered set.
7. Reports the first failure with file + slug + field path.

## What this guide does NOT cover

- The host's reflection loop implementation (LLM choice, prompt template,
  evidence-collection strategy).
- The promotion gate's mechanics (A/B harness, scorer pipeline, governance UI).
- Multi-tenant isolation, quotas, billing — runtime-policy concerns.
- The base persona format itself — that's [AIP-9](/docs/aip-9).

These stay out of the spec on purpose.

## See also

- [AIP-12 — PLAYBOOK.md spec](/docs/aip-12)
- [AIP-9 — agentoperators/v1](/docs/aip-9) — base personas
- [AIP-11 — agentlearning/v1](/docs/aip-11) — single-turn lessons
- [AIP-7 — governance, approval, audit](/docs/aip-7) — promotion gate
- [`./PLAYBOOK.schema.json`](./PLAYBOOK.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference PLAYBOOK.md files
