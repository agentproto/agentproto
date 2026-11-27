---
# Reference example, AIP-74 (billing/v1): usage-based SaaS with a custom
# 1 000-credit anchor, integer credits (decimals 0), spendOrder tie-break,
# unbounded buyer top-up, one-time bundle, and the Autumn rail.
schema: billing/v1
name: usage-saas
title: Usage SaaS billing
version: 0.4.0

assets:
  - { ref: aip://49/USD }
  - ref: SAAS_CREDITS
    name: SaaS Credits
    symbol: SCR
    decimals: 0
    standard: internal
    ruleSet: { settleOut: false, spendableOn: ["*"], convertEdges: [], transfer: none }
    partitions:
      - { id: "SAAS_CREDITS:monthly", asset: SAAS_CREDITS, restriction: [] }
      - { id: "SAAS_CREDITS:topup",   asset: SAAS_CREDITS, restriction: [] }
primaryAsset: SAAS_CREDITS

anchor: { currency: USD, creditsPerUnit: 1000 }
spendOrder: ["SAAS_CREDITS:monthly", "SAAS_CREDITS:topup"]
# Metered usage as data (rules 29 to 32, 35). Example values: the AIP sets none.
usage:
  defaults: { margin: 1.5, floorMinor: 0 }
  categories:
    - { id: llm, match: { kind: llm }, cost: { source: measured }, marginFloor: 1.1 }
    - { id: messaging-fee, match: { kind: messaging-fee }, cost: { source: measured }, margin: at-cost }
    - { id: search, match: { kind: search }, cost: { source: fixed, amount: 0.0015, currency: USD } }
taxBasis: gross

features:
  - { id: paid_plan, type: boolean }
  - { id: managed_service_access, type: boolean }
  - { id: credits, type: credits }

accounts:
  kinds: [organization]
  hierarchy: { maxDepth: 0, funding: [] }
payer: { strategy: self, owner: [organizationId] }

conversions:
  - id: usd-to-credits
    from: USD
    to: SAAS_CREDITS
    rail: autumn
    mint: { partition: "SAAS_CREDITS:topup" }
    enabled: true

offers:
  - id: credit-top-up
    price: { model: prepaid-pool, amountMinor: buyer, currency: USD }
    convert: usd-to-credits
  - id: base-plan
    price: { model: subscription, amountMinor: 1900, currency: USD, interval: month }
    includes:
      - { feature: paid_plan }
      - { feature: managed_service_access }
      - { feature: credits, amountMinor: 10000, partition: "SAAS_CREDITS:monthly", rollover: none }
    subscription: { anchor: payment, onUpgrade: none }
  - id: starter-bundle
    price: { model: one-time, amountMinor: 9900, currency: USD }
    includes:
      - { feature: paid_plan }
      - { feature: managed_service_access }
      - { feature: credits, amountMinor: 15000, partition: "SAAS_CREDITS:topup" }

rails:
  - { id: autumn, productTag: usage-saas }
---

# Usage SaaS

Exercises a custom anchor (`1 000 credits = 1 USD`), integer credits (`decimals:
0`), `spendOrder` tie-break (`monthly` consumed before `topup`), unbounded
buyer-chosen top-ups, a `one-time` bundle with feature access and credits, and
the `autumn` rail projection.
