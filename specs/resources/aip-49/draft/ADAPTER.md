# ADAPTER.md — implementing AIP-49 (Wallet) in a host runtime

This document is the implementer's guide for any runtime that wants to
**define assets, maintain wallets, and authorize transfers** using the
[AIP-49](/docs/aip-49) `agentwallet/v1` primitive.
It is normative for the parts marked MUST and informative for the parts
marked SHOULD.

AIP-49 is a **pure, event-sourced ledger primitive**. Every side effect goes
through an injected port. The core has no I/O, no clock access, no database
dependency.

---

## Conceptual model

```
Asset (ERC-20 style declaration)
  └─ Partition (ERC-1410 tranche — a named subset of an asset's supply)
       └─ Lot (a concrete holding: amount, acquired_at, restrictions)

Journal (event-sourced) → fold → Wallet state
```

- **Asset** — the unit of value (e.g. `credits`, `compute-minutes`, `tokens`).
  Declared once; immutable after registration.
- **Partition** — a named tranche within an asset (e.g. `"promotional"`,
  `"earned"`, `"locked"`). Partitions carry a `PartitionPolicy` (vesting, expiry,
  transfer restrictions).
- **Lot** — a concrete holding: `{ amount, acquiredAt, restrictions }`. Lots are
  the atoms of the wallet. Events operate on lots.
- **Journal** — an append-only log of wallet events. `fold(journal)` → current
  wallet state.

---

## Asset declaration

Assets are declared with `defineAsset`:

```ts
import { defineAsset } from "@agentproto/wallet"

const CREDITS = defineAsset({
  ref: "@acme/credits",          // stable globally-addressable id
  symbol: "CRD",                 // ERC-20 style ticker
  decimals: 6,                   // minor unit scale (1 credit = 1_000_000 units)
  standard: "erc20-compatible",  // "erc20-compatible" | "erc1400" | "erc1410" | "native"
  ruleSet: {
    transferScope: "intra-principal",   // who may receive transfers
    allowPartialLot: true,
    burnOnExpiry: true,
  },
  convert: [
    { to: "@acme/pro-credits", rate: 2, direction: "one-way" }
  ],
})
```

`defineAsset` validates against `ASSET.schema.json` and freezes the declaration.
A host MUST NOT allow mutation of a registered asset after first use — the
declaration is the permanent contract.

### `AssetRegistry`

The host maintains an `AssetRegistry` that holds all known asset declarations:

```ts
const registry = new AssetRegistry()
registry.register(CREDITS)

registry.get("@acme/credits")      // → AssetDeclaration
registry.all()                     // → AssetDeclaration[]
```

---

## Partition and partition policy

A partition is a named tranche on a principal's wallet:

```ts
const partitionSpec: PartitionSpec = {
  id: partitionId(CREDITS, "promotional"),  // "@acme/credits:promotional"
  policy: {
    expires: { at: "2026-12-31T00:00:00Z", action: "burn" },
    vest: { startAt: "2026-06-19T00:00:00Z", durationDays: 30, kind: "linear" },
    transfer: { allowed: false },
  },
}
```

`PartitionPolicy` evaluation:

```ts
const ctx: PolicyContext = { now: new Date().toISOString(), principal }
const eval = evaluatePolicy(policy, amount, ctx)
// eval.allowed: boolean
// eval.available: bigint  (vested, non-expired amount)
// eval.reason?: string
```

---

## Event-sourced journal

The wallet state is never stored directly — only the event journal is persisted.
`fold(events)` produces the current state.

```ts
import { fold } from "@agentproto/wallet"

const events: WalletEvent[] = await store.load(principalId)
const wallet = fold(events)
// wallet.balances: Map<PartitionId, bigint>
// wallet.lots: Map<LotId, Lot>
```

### Event types

| Event | Effect |
|---|---|
| `credit` | Add lots to a partition. |
| `debit` | Remove amount from lots (FIFO or policy-driven). |
| `transfer` | Move lots from one principal to another. |
| `expire` | Burn expired lots (policy-driven). |
| `vest` | Mark lots as vested (unlock for spending). |
| `convert` | Exchange lots of one asset for another at the declared rate. |
| `coalesce` | Merge lots within the same asset (reduce fragmentation). |

---

## Restriction lattice

Restrictions are composable tags that constrain what can be done with a lot:
`LOCKED`, `VESTING`, `RESTRICTED_TRANSFER`, etc.

The restriction lattice uses `meet` (most restrictive wins):

```ts
import { meet, UNRESTRICTED } from "@agentproto/wallet"

const effective = meet([UNRESTRICTED, { tags: ["VESTING"] }, { tags: ["LOCKED"] }])
// → { tags: ["LOCKED", "VESTING"] }  (most restrictive)
```

A host MUST apply `meet` across all lots involved in a debit/transfer before
authorizing. A lot tagged `LOCKED` cannot be spent even if it has a positive
balance.

### No laundering invariant

`meet` is monotone: composing restrictions can only make them MORE restrictive,
never less. A host MUST NOT allow a `convert` or `transfer` to shed restriction
tags — the output lot MUST carry at least the `meet` of the input restrictions.

---

## Authorization engine

Before executing any debit/transfer/convert, the host MUST call `authorize`:

```ts
import { authorize } from "@agentproto/wallet"

const decision = authorize({
  wallet,
  event: { kind: "debit", asset: "@acme/credits", amount: 1000n, partition: "earned" },
  policy: operatorPolicy,
  context: { now, principal, delegationChain },
})

if (!decision.allowed) throw new Error(decision.reason)
```

`authorize` checks:

1. **Sufficient balance** — enough unrestricted, vested, non-expired lots exist.
2. **Transfer scope** — `asset.ruleSet.transferScope` allows the target principal.
3. **Restriction lattice** — the effective restriction permits the operation.
4. **Delegation lineage** — if a delegate is acting, the delegation chain's
   restrictions are applied (`lineage-min`: the most restrictive delegation in
   the chain wins).

---

## Port contracts

The wallet kit is pure. All I/O goes through injected ports:

```ts
/** The host supplies this to persist the journal. */
interface WalletStorePort {
  load(principalId: string): Promise<readonly WalletEvent[]>
  append(principalId: string, event: WalletEvent): Promise<void>
}

/** The host supplies this to stamp timestamps on events. */
interface ClockPort {
  now(): Date
}
```

The wallet kit MUST NOT import `Date.now()` or any clock directly.

---

## `coalesce` vs `convert`

Two operations reduce fragmentation or change units — do not confuse them:

| Operation | Invariant | Use case |
|---|---|---|
| `coalesce` | Same asset, same partition. Merge N lots → 1. | Reduce lot count after many small credits. |
| `convert` | Different assets, declared `convert` edge. No-arbitrage (rate in `AssetDeclaration`). | Exchange credits → pro-credits at the declared rate. |

A host MUST NOT allow `convert` between assets with no declared `convert` edge.
A host MUST NOT allow `coalesce` across different partitions (it would shed
partition-specific restrictions).

---

## Floor primitive

A `floor` on a partition declares a minimum balance the principal must retain:

```ts
// Bounded floor: agent must keep ≥100 credits in "earned"
const floor = { asset: "@acme/credits", partition: "earned", amount: 100n, kind: "bounded" }

// Unbounded floor: all lots are locked (short position)
const shortFloor = { asset: "@acme/credits", partition: "locked", kind: "unbounded" }
```

The `authorize` engine MUST check that any debit leaves the partition at or above
the floor. A debit that would breach the floor is refused with
`insufficient_balance_floor`.

---

## Error codes

| Code | Meaning |
|---|---|
| `asset_not_found` | `ref` not in the `AssetRegistry`. |
| `asset_already_registered` | Attempting to re-register a frozen asset. |
| `insufficient_balance` | Debit/transfer exceeds available (vested, unrestricted) balance. |
| `insufficient_balance_floor` | Operation would breach a floor constraint. |
| `restriction_blocked` | Lot is LOCKED or carries a restriction that forbids the operation. |
| `transfer_scope_violation` | Target principal is outside `asset.ruleSet.transferScope`. |
| `convert_edge_missing` | No declared `convert` edge between the two assets. |
| `partition_not_found` | Partition id not known for this principal's wallet. |
| `delegation_lineage_violation` | Delegate's restrictions are more restrictive than the action allows. |

---

## Conformance checklist

A conforming implementation MUST:

- [ ] Freeze asset declarations after first use (`defineAsset` validates + freezes).
- [ ] Use `fold(journal)` to derive wallet state; never mutate state in place.
- [ ] Apply `meet` across all lots before authorizing any debit/transfer.
- [ ] Enforce the no-laundering invariant: output lot restrictions ≥ input restrictions.
- [ ] Call `authorize` before executing any state-mutating event.
- [ ] Check floor constraints before completing a debit.
- [ ] Never import `Date.now()` or any clock in the wallet core — use `ClockPort`.
- [ ] Never persist wallet state directly — only the event journal.

---

## See also

- [AIP-49 — agentwallet/v1 spec](/docs/aip-49)
- [AIP-23 — identity (delegation chain)](/docs/aip-23)
- [AIP-7 — governance (authorization policies)](/docs/aip-7)
- [`./ASSET.schema.json`](./ASSET.schema.json)
- [Reference impl: `@agentproto/wallet`]
