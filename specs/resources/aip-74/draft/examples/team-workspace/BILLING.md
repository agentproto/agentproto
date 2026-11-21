---
# Reference example, AIP-74 (billing/v1): multi-currency team workspace with
# org-to-workspace credit allocations, unbounded subscription rollover, and
# a custom org-kind payer strategy.
schema: billing/v1
name: team-workspace
title: Team workspace billing
version: 0.4.0

assets:
  - { ref: aip://49/EUR }
  - { ref: aip://49/USD }
  - ref: WORKSPACE_CREDITS
    name: Workspace Credits
    symbol: WCR
    decimals: 2
    standard: internal
    ruleSet: { settleOut: internal-ledger, spendableOn: ["*"], convertEdges: [], transfer: internal }
    partitions:
      - { id: "WORKSPACE_CREDITS:general", asset: WORKSPACE_CREDITS, restriction: [] }
      - { id: "WORKSPACE_CREDITS:bonus",   asset: WORKSPACE_CREDITS, restriction: [unearned] }
primaryAsset: WORKSPACE_CREDITS

anchor: { currency: USD, creditsPerUnit: 100 }
fx: { EUR: 1.18 }
taxBasis: gross

features:
  - { id: credits, type: credits }

accounts:
  kinds: [user, organization, workspace]
  hierarchy: { maxDepth: 1, funding: [pool, allocated_budget] }
payer:
  # Personal org -> acting user wallet; team -> org pool; enterprise -> pool or
  # per-workspace allocation account. Expressed as a vendor strategy.
  strategy: x-acme:org-kind
  owner: [organizationId, workspaceId, userId]
transfers:
  allow: [allocate]
  from: ["WORKSPACE_CREDITS:general"]
  expiry: inherit

conversions:
  - id: eur-to-credits
    from: EUR
    to: WORKSPACE_CREDITS
    rail: stripe
    mint: { partition: "WORKSPACE_CREDITS:general" }
    bonus: { strategy: tiered-lots/v1, partition: "WORKSPACE_CREDITS:bonus", tiers: [[50000, 12], [10000, 12], [0, 10]] }
    enabled: true
  - id: usd-to-credits
    from: USD
    to: WORKSPACE_CREDITS
    rail: stripe
    mint: { partition: "WORKSPACE_CREDITS:general" }
    bonus: { strategy: tiered-lots/v1, partition: "WORKSPACE_CREDITS:bonus", tiers: [[50000, 12], [10000, 12], [0, 10]] }
    enabled: true

offers:
  - { id: starter_eur, price: { model: prepaid-pool, amountMinor: 1000,  currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: ws_pack_starter_eur } } }
  - { id: growth_eur,  price: { model: prepaid-pool, amountMinor: 5000,  currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: ws_pack_growth_eur } } }
  - { id: scale_eur,   price: { model: prepaid-pool, amountMinor: 10000, currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: ws_pack_scale_eur } } }
  - { id: pro_eur,     price: { model: prepaid-pool, amountMinor: 50000, currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: ws_pack_pro_eur } } }
  - { id: starter_usd, price: { model: prepaid-pool, amountMinor: 1000,  currency: USD }, convert: usd-to-credits, rail: { stripe: { lookupKey: ws_pack_starter_usd } } }
  - { id: growth_usd,  price: { model: prepaid-pool, amountMinor: 5000,  currency: USD }, convert: usd-to-credits, rail: { stripe: { lookupKey: ws_pack_growth_usd } } }
  - { id: scale_usd,   price: { model: prepaid-pool, amountMinor: 10000, currency: USD }, convert: usd-to-credits, rail: { stripe: { lookupKey: ws_pack_scale_usd } } }
  - { id: pro_usd,     price: { model: prepaid-pool, amountMinor: 50000, currency: USD }, convert: usd-to-credits, rail: { stripe: { lookupKey: ws_pack_pro_usd } } }
  - id: starter_month_eur
    price: { model: subscription, amountMinor: 2000, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 220000, partition: "WORKSPACE_CREDITS:general", rollover: unbounded } ]
    subscription: { anchor: payment, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: ws_starter_monthly_eur } }
  - id: starter_month_usd
    price: { model: subscription, amountMinor: 2000, currency: USD, interval: month }
    includes: [ { feature: credits, amountMinor: 220000, partition: "WORKSPACE_CREDITS:general", rollover: unbounded } ]
    subscription: { anchor: payment, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: ws_starter_monthly_usd } }
  - id: pro_month_eur
    price: { model: subscription, amountMinor: 5000, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 550000, partition: "WORKSPACE_CREDITS:general", rollover: unbounded } ]
    subscription: { anchor: payment, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: ws_pro_monthly_eur } }
  - id: pro_month_usd
    price: { model: subscription, amountMinor: 5000, currency: USD, interval: month }
    includes: [ { feature: credits, amountMinor: 550000, partition: "WORKSPACE_CREDITS:general", rollover: unbounded } ]
    subscription: { anchor: payment, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: ws_pro_monthly_usd } }
  - id: team_month_eur
    price: { model: subscription, amountMinor: 10000, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 1150000, partition: "WORKSPACE_CREDITS:general", rollover: unbounded } ]
    subscription: { anchor: payment, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: ws_team_monthly_eur } }
  - id: team_month_usd
    price: { model: subscription, amountMinor: 10000, currency: USD, interval: month }
    includes: [ { feature: credits, amountMinor: 1150000, partition: "WORKSPACE_CREDITS:general", rollover: unbounded } ]
    subscription: { anchor: payment, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: ws_team_monthly_usd } }

grants:
  - id: welcome
    trigger: { kind: manual }
    amount: { fixedMinor: 50000 }
    partition: "WORKSPACE_CREDITS:general"
    key: "{account}:once"

rails:
  - { id: stripe, productTag: team-workspace }

metadata:
  acme:
    marginFloorPercent: 10
    postpaid: { kinds: [organization], cycle: month }
---

# Team workspace

Exercises dual-currency fiat conversions (`EUR` and `USD`), allocate-only
organization-to-workspace transfers, a vendor payer strategy (`x-acme:org-kind`),
payment-anchored subscriptions with `rollover: unbounded`, and host-specific
vendor `metadata`.
