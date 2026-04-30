# ADAPTER.md — implementing AIP-8 in a host runtime

This document is the implementer's guide for any runtime, framework, or language
that wants to **load, register, and execute** an
[AIP-8 agentagencies/v1](/docs/aip-8) workspace. It is normative for the parts
marked MUST and informative for the parts marked SHOULD.

The audience is a runtime author — someone exposing `defineService`,
`defineProcedure`, `defineEngagement`, `defineAgreement`, `defineDeliverable`,
and `defineInvoice` to agency authors. Authors themselves should read
[`./SKILL.md`](./SKILL.md), not this file.

AIP-8 sits on top of two other specs. A conforming host MUST first implement, or
compose with implementations of:

- [AIP-6](/docs/aip-6) — `agentcompanies/v1` for `COMPANY.md`, `ROLE.md`,
  `OPERATOR.md`, `OBJECTIVE.md`. AIP-8 inherits all four and references roles +
  operators by slug.
- [AIP-7](/docs/aip-7) — `agentgovernance/v1` for `signature`, `audit-event`,
  `policy`. Every contractual artifact in AIP-8 (`AGREEMENT.md`,
  `DELIVERABLE.md`, `INVOICE.md`) is gated through AIP-7's signature doctype,
  and every state transition emits an AIP-7 audit event.

If your runtime can't satisfy those preconditions, refuse to load AIP-8 packages
— partial conformance is worse than refusal.

## Contract overview

A conforming host implements five responsibilities, in this order when an agency
workspace is registered:

1. **Resolve the AIP-6 substrate** — locate `COMPANY.md` and the roles /
   operators referenced by AIP-8 doctypes. Refuse if any referenced slug is
   missing.
2. **Parse the agency manifests** — read every doctype file, validate against
   [`./AGENCY.schema.json`](./AGENCY.schema.json), surface errors with file
   path + field path.
3. **Load the entries** — for each `PROCEDURE.md`, import the file referenced by
   `entry`. The entry's default export is a value produced by
   `defineProcedure(...)` (other doctypes follow the same pattern:
   `defineService`, `defineEngagement`, `defineAgreement`, `defineDeliverable`,
   `defineInvoice`).
4. **Reconcile** — verify every entry value matches its manifest frontmatter.
   Drift between file and code is a spec bug.
5. **Register, gate, and run** — wire each doctype into the host's catalog,
   enforce the lifecycle state machine, route every contractual transition
   through AIP-7 signature checks, and emit audit events on every state change.

## Doctype loaders

Each doctype is backed by a `defineX(...)` factory. All six are canonical names
that hosts MUST expose.

### `defineService`

- Pure metadata; no runtime behaviour beyond catalog registration.
- Validate `pricing_model` resolves to a `PRICING-MODEL.md` slug.
- Validate every entry in `procedures[]` resolves to a `PROCEDURE.md` slug at
  registration time.
- Reject services that reference roles missing from the company's AIP-6 `roles/`
  folder.

### `defineProcedure`

- The only doctype with executable runtime behaviour.
- Two shapes — both MUST be supported:
  - **Inline** — entry exposes a `defineProcedure(...)` whose body composes
    [AIP-15](/docs/aip-15) `defineStep` values directly.
  - **Reference** — entry sets `workflow: "<slug>"` pointing at a registered
    AIP-15 `WORKFLOW.md`.
- The procedure runner MUST emit a `procedure.checkpoint` audit event every time
  a declared `checkpoints[].afterStep` completes.
- The procedure runner MUST register declared `deliverables[]` and invoke the
  corresponding `defineDeliverable(...)` factory when the named producing step
  completes.

### `defineEngagement`

- Stateful. The host MUST persist the engagement's `state` field.
- The state machine is fixed (see "Lifecycle state machine" below). Hosts MUST
  refuse illegal transitions at the API surface; they MUST NOT silently accept
  and overwrite.
- Engagement creation does NOT bind an agreement; that happens on transition to
  `agreed`.

### `defineAgreement`

- Contractual. Carries the legal commitment.
- A host MUST refuse to advance an agreement to `signed` unless an AIP-7
  `signature` event exists with `subject: <agreement-slug>` for every signer
  listed in the agreement's `signers[]`.
- Agreement bodies MAY embed prose; the embedded prose is normative text, not
  commentary. Hosts MUST pass it verbatim into the signature event's hashed
  payload.

### `defineDeliverable`

- An artifact produced by a procedure step.
- A host MAY treat the deliverable as accepted on creation (auto-accept) ONLY
  when the bound agreement explicitly permits it via `acceptance_policy: auto`.
  Otherwise, hosts MUST require an AIP-7 signature from the role named in
  `agreement.acceptance_signers[]`.
- Hosts SHOULD link deliverables back to the engagement via
  `engagement.deliverables[]` so the audit log can reconstruct the full chain.

### `defineInvoice`

- A bill. Carries amount, currency, line items, due date.
- Pricing rules live in `PRICING-MODEL.md`; the invoice's line items MUST be
  derivable from the pricing model + the engagement's recorded effort or
  fixed-price terms.
- A host MUST refuse to mark an invoice as `issued` without an AIP-7 signature
  from the issuing role.
- A host SHOULD support an optional counter-signature on payment receipt; this
  is OPTIONAL but recommended for full audit chain.

## Lifecycle state machine

Engagements run through a small, fixed state graph. Hosts MUST implement it
exactly:

```
draft ──► proposed ──► agreed ──► in-progress ──► delivered ──► invoiced ──► closed
                  │                  │                                          ▲
                  └──► cancelled ◄───┴──────────────────────────────────────────┘
```

| Transition                | Precondition                                                                                 | Audit event            |
| ------------------------- | -------------------------------------------------------------------------------------------- | ---------------------- |
| `draft → proposed`        | Engagement has `service`, `counterparty`, populated terms.                                   | `engagement.proposed`  |
| `proposed → agreed`       | Bound `AGREEMENT.md` has all required AIP-7 signatures.                                      | `engagement.agreed`    |
| `agreed → in-progress`    | Procedure runner started successfully.                                                       | `engagement.started`   |
| `in-progress → delivered` | All declared `deliverables[]` exist and are signed-accepted (or auto-accepted under policy). | `engagement.delivered` |
| `delivered → invoiced`    | `INVOICE.md` issued and signed.                                                              | `engagement.invoiced`  |
| `invoiced → closed`       | Payment recorded (or write-off documented).                                                  | `engagement.closed`    |
| `* → cancelled`           | Allowed from any pre-`closed` state with reason. Compensations run.                          | `engagement.cancelled` |

Each transition MUST be a single audited operation. The host MUST NOT advance
two states in a single API call — every transition is its own atomic event with
its own audit row.

## Procedure execution semantics

Procedures are workflow-shaped (see [AIP-15](/docs/aip-15)). The runner inherits
the AIP-15 step-execution contract verbatim:

- All eight step kinds (`tool`, `branch`, `parallel`, `suspend`, `approval`,
  `map`, `loop`, `subworkflow`) MUST be supported.
- Step approvals follow the
  [AIP-15 approval enforcement rules](../aip-15/ADAPTER.md#approval-enforcement)
  — manifest declares author intent, host policy can tighten but never loosen.
- Compensation walks on failure follow AIP-15 semantics.

AIP-8 adds three procedure-specific behaviours on top:

1. **Checkpoint events.** When a step listed in `procedure.checkpoints[]`
   completes, the host MUST emit `procedure.checkpoint` to the audit log
   carrying `{ procedureId, checkpointId, stepId, outputs }`. These let the
   engagement subscribe to progress without exposing every intermediate step.
2. **Deliverable production.** When a step listed in
   `procedure.deliverables[].producedBy` completes, the host MUST instantiate
   the corresponding `DELIVERABLE.md` from the step outputs, validate it against
   the deliverable's declared schema, write it to `deliverables/<slug>/`, and
   append the slug to `engagement.deliverables[]`. Failure to validate is a
   runtime error, not a warning.
3. **Engagement context.** Every step body receives an `engagement` field on its
   `context` carrying the parent engagement's slug, current state, and bound
   agreement slug. Steps that need to look up counterparty data, pricing rules,
   or prior deliverables resolve them from there.

## Inheritance from AIP-6

The agency package IS a company package with operations doctypes layered on top.
Concretely:

- The host's loader for `COMPANY.md`, `ROLE.md`, `OPERATOR.md`, `OBJECTIVE.md`
  is reused as-is. AIP-8 does not redefine those doctypes.
- `SERVICE.md` MAY reference `default_role: <role-slug>` — the slug resolves
  against the AIP-6 `roles/` folder. Unresolved references MUST refuse
  registration.
- `PROCEDURE.md` MAY reference operators by slug under `assigned_to`. At
  runtime, the host injects the operator's identity into the step `context` for
  AIP-7 signature attribution.
- `OBJECTIVE.md` slugs MAY appear in `engagement.objectives[]` to link an
  engagement to one or more company-level objectives. This is informational; no
  state-machine consequence.

## Inheritance from AIP-7

Every contractual transition is an AIP-7 audit event; every contractual artifact
is gated by an AIP-7 signature. Concretely:

- The host's [audit-log writer](../aip-7/) is reused. AIP-8 emits the event
  names listed in the lifecycle table; the chain is the same JSONL hash chain.
- The host's signature validator is reused. AIP-8 imposes doctype-specific rules
  on what `subject`, `signers`, and policy reference MUST appear in the
  signature payload (see "Doctype loaders" above).
- The host's `POLICY.md` resolver is reused. AIP-8 references policies in two
  places:
  - `AGENCY.md` `default_policy:` — the autonomy rule applied to any contractual
    transition without a more-specific override.
  - `AGREEMENT.md` `policy:` — the policy applicable for actions taken under
    that specific contract.

The stricter of the two policies wins, same rule as AIP-15
[approval resolution](../aip-15/ADAPTER.md#approval-enforcement).

## Error envelope

Errors raised during agency operations leave the host as:

```ts
type AgencyResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        retryable?: boolean
        cause?: unknown
      }
    }
```

Use the AIP-14 vocabulary plus an AIP-8 error vocabulary:

| Code                         | Meaning                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `engagement_state_invalid`   | Caller attempted an illegal state transition.                             |
| `agreement_unsigned`         | Tried to advance to `agreed` without all required signatures.             |
| `deliverable_schema_invalid` | A producing step emitted output that didn't match the deliverable schema. |
| `pricing_model_unresolved`   | An invoice referenced a pricing model that doesn't resolve.               |
| `policy_denied`              | Autonomy policy refused the action; human approval required.              |
| `procedure_runtime`          | Underlying AIP-15 workflow runner returned an error — see `cause`.        |

Domain prefixes use a colon (`agency:state-invalid`) for vendor-specific codes —
same convention as AIP-14.

## Loader rules

Procedure entry files (`procedure.ts` / `.py` / etc.) follow the same loader
rules as [AIP-15](/docs/aip-15):

- **No I/O at module load.** All I/O happens inside step bodies.
- **No reliance on a running host singleton.** Entries MUST be importable in
  isolation.
- **Default export is the `defineProcedure(...)` return value.** Named exports
  for additional service / engagement / agreement factories are tolerated but
  the procedure is the canonical default.

The other five `defineX` factories are pure data-builders — they have no side
effects and no I/O contract. Hosts MAY register them eagerly at load time.

## Catalog vs instance separation

The host MUST distinguish:

- **Catalog doctypes** — `SERVICE.md`, `PROCEDURE.md`, `PRICING-MODEL.md`,
  `POLICY.md`, `ROUTINE.md`, `CAPACITY.md`. One per kind-of-thing the agency
  offers; loaded once per workspace.
- **Instance doctypes** — `ENGAGEMENT.md`, `AGREEMENT.md`, `DELIVERABLE.md`,
  `INVOICE.md`, `COUNTERPARTY.md`. Many per catalog item; created over the
  agency's lifetime.

Catalog files SHOULD live under `services/`, `procedures/`, `pricing-models/`,
etc.; instance files under `engagements/`, `agreements/`, `deliverables/`,
`invoices/`. The split is by convention but hosts MAY enforce it for clarity.

## Run lifecycle events

The host MUST emit a structured event stream per engagement (in addition to the
AIP-15 step events emitted by procedure runs):

| Event                  | When                                                     |
| ---------------------- | -------------------------------------------------------- |
| `engagement.created`   | Engagement file written, state = `draft`.                |
| `engagement.proposed`  | Terms drafted, awaiting agreement.                       |
| `engagement.agreed`    | All signatures present, ready to start.                  |
| `engagement.started`   | Procedure runner accepted. Mirrors AIP-15 `run.started`. |
| `procedure.checkpoint` | Per-checkpoint progress signal.                          |
| `deliverable.produced` | A producing step emitted a deliverable that validated.   |
| `deliverable.signed`   | An acceptance signature was recorded.                    |
| `engagement.delivered` | All deliverables accepted.                               |
| `invoice.issued`       | Invoice signed by issuing role.                          |
| `invoice.paid`         | Payment recorded (optional counter-signature).           |
| `engagement.closed`    | Payment cleared and engagement closed.                   |
| `engagement.cancelled` | Cancellation recorded; compensations run.                |

These events feed the same audit log as AIP-7 / AIP-15 events. Tracing backends
consume them uniformly.

## Multi-language hosts

Same convention as AIP-14 / AIP-15:

| Language                | Function names                                                                                                  | Schema dialect            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------- |
| TypeScript / JavaScript | `defineService`, `defineProcedure`, `defineEngagement`, `defineAgreement`, `defineDeliverable`, `defineInvoice` | JSON Schema or zod        |
| Python                  | `define_service`, `define_procedure`, …                                                                         | JSON Schema or pydantic   |
| Go                      | `DefineService`, `DefineProcedure`, …                                                                           | JSON Schema struct tags   |
| Rust                    | `define_service`, `define_procedure`, … (free fns)                                                              | JSON Schema or `schemars` |

Polyglot workspaces — different procedures in different languages — are allowed.
Each `PROCEDURE.md` declares its own `entry` file; the runtime dispatches per
language.

## Registration test

A conforming host SHOULD provide a `validate(agencyPath)` helper that:

1. Resolves the AIP-6 substrate; refuses if missing.
2. Parses every doctype manifest; validates against `AGENCY.schema.json`.
3. Cross-resolves every slug reference (service → procedure → workflow → tool,
   agreement → policy, etc.); reports unresolved refs.
4. Loads every procedure entry; verifies `defineProcedure(...)` returned a
   value.
5. Reconciles entry shape against manifest frontmatter.
6. Replays the AIP-7 audit chain end-to-end; reports first hash mismatch.
7. Walks every existing engagement; verifies state transitions recorded in audit
   log are legal.
8. Reports the first failure with file + field path + audit-event pointer.

This is the standard "is this agency installable?" handshake.

## What this guide does NOT cover

- The host's persistence model (filesystem-only, mirrored to DB, distributed
  registry).
- The host's payment-collection backend (Stripe, ACH, manual).
- Counterparty identity verification (KYC, manual onboarding).
- Multi-currency / FX handling — runtime-policy concern.
- Tax handling — runtime-policy concern; `INVOICE.md` carries line-item
  subtotals, taxes are a layer the host adds.

These stay out of the spec on purpose.

## See also

- [AIP-8 — agentagencies/v1 spec](/docs/aip-8)
- [AIP-6 — agentcompanies/v1](/docs/aip-6)
- [AIP-7 — agentgovernance/v1](/docs/aip-7)
- [AIP-15 — WORKFLOW.md spec](/docs/aip-15) — procedures are workflow-shaped
- [AIP-14 — TOOL.md spec](/docs/aip-14) — workflow steps invoke tools
- [`./AGENCY.schema.json`](./AGENCY.schema.json) — manifest validator
- [`./SKILL.md`](./SKILL.md) — agent-side authoring skill
- [`./EXAMPLES.md`](./EXAMPLES.md) — reference workspace patterns
