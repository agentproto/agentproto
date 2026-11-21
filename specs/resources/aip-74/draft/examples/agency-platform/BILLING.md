---
# Reference example, AIP-74 (billing/v1): B2B agency platform with net tax
# basis, buyer-chosen credit top-up, 12-month purchased expiry, hierarchy/v1
# allocate + reclaim transfers, and boolean plan features.
schema: billing/v1
name: agency-platform
title: Agency platform billing
version: 0.4.0

assets:
  - { ref: aip://49/EUR }
  - { ref: aip://49/USD }
  - ref: PLATFORM_CREDITS
    name: Platform Credits
    symbol: PCR
    decimals: 2
    standard: internal
    ruleSet: { settleOut: internal-ledger, spendableOn: ["*"], convertEdges: [], transfer: internal }
    partitions:
      - { id: "PLATFORM_CREDITS:purchased",    asset: PLATFORM_CREDITS, restriction: [] }
      - { id: "PLATFORM_CREDITS:subscription", asset: PLATFORM_CREDITS, restriction: [] }
      - { id: "PLATFORM_CREDITS:welcome",      asset: PLATFORM_CREDITS, restriction: [welcome] }
      - { id: "PLATFORM_CREDITS:bonus",        asset: PLATFORM_CREDITS, restriction: [unearned] }
primaryAsset: PLATFORM_CREDITS

anchor: { currency: USD, creditsPerUnit: 100 }
fx: { EUR: 1.18 }
taxBasis: net

features:
  - { id: credits, type: credits }
  - { id: storefront, type: boolean }
  - { id: branding, type: boolean }
  - { id: agency_console, type: boolean }

accounts:
  kinds: [organization, agency]
  hierarchy: { maxDepth: 1, funding: [pool, allocated_budget] }
payer:
  strategy: hierarchy/v1
  owner: [orgId]
  affordability: spendable
transfers:
  allow: [allocate, reclaim]
  from: ["PLATFORM_CREDITS:purchased"]
  expiry: inherit

conversions:
  - id: eur-to-credits
    from: EUR
    to: PLATFORM_CREDITS
    rail: stripe
    mint: { partition: "PLATFORM_CREDITS:purchased", expires: { after: P12M } }
    bonus: { strategy: tiered-lots/v1, partition: "PLATFORM_CREDITS:bonus", tiers: [[30001, 15], [12000, 10], [6000, 5], [0, 0]] }
    enabled: true

offers:
  - id: credits
    price: { model: prepaid-pool, amountMinor: buyer, minMinor: 1000, maxMinor: 100000, currency: EUR }
    convert: eur-to-credits
  - id: starter
    price: { model: subscription, amountMinor: 7900, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 1030000, partition: "PLATFORM_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, onUpgrade: none }
  - id: growth
    price: { model: subscription, amountMinor: 14900, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 2020000, partition: "PLATFORM_CREDITS:subscription", rollover: none }, { feature: storefront } ]
    subscription: { anchor: calendar, onUpgrade: none }
  - id: agency
    price: { model: subscription, amountMinor: 39900, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 5650000, partition: "PLATFORM_CREDITS:subscription", rollover: none }, { feature: storefront }, { feature: branding }, { feature: agency_console } ]
    subscription: { anchor: calendar, onUpgrade: none }

grants:
  - id: welcome
    trigger: { kind: manual }
    amount: { strategy: "x-acme:welcome-grant" }
    partition: "PLATFORM_CREDITS:welcome"
    key: "{account}:once"

rails:
  - { id: stripe, productTag: agency-platform }
---

# Agency platform

Exercises `taxBasis: net`, bounded buyer-chosen top-ups (`minMinor` / `maxMinor`)
with 12-month expiry and volume bonus tiers, `hierarchy/v1` payer resolution
with `affordability: spendable`, parent-to-child `allocate` + `reclaim`, and
subscriptions with no grace period (`past_due` closes immediately).
