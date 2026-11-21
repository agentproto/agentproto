---
# Reference example, AIP-74 (billing/v1): consumer app with credit packs,
# loyalty points, monthly subscriptions (calendar anchor, 7-day grace), and
# a weekly free top-up grant. Minor units: cents, hundredths of a credit.
schema: billing/v1
name: consumer-app
title: Consumer app billing
version: 0.4.0

assets:
  - { ref: aip://49/EUR }
  - { ref: aip://49/USD }
  - ref: APP_CREDITS
    name: App Credits
    symbol: ACR
    decimals: 2
    standard: internal
    ruleSet: { settleOut: internal-ledger, spendableOn: ["*"], convertEdges: [], transfer: internal }
    partitions:
      - { id: "APP_CREDITS:welcome",      asset: APP_CREDITS, restriction: [welcome],    defaultTtlMs: 2592000000 }
      - { id: "APP_CREDITS:grant",        asset: APP_CREDITS, restriction: [grant] }
      - { id: "APP_CREDITS:purchased",    asset: APP_CREDITS, restriction: [] }
      - { id: "APP_CREDITS:bonus",        asset: APP_CREDITS, restriction: [unearned] }
      - { id: "APP_CREDITS:subscription", asset: APP_CREDITS, restriction: [] }
      - { id: "APP_CREDITS:promo-fast",   asset: APP_CREDITS, restriction: [promo-fast], spendableOn: ["llm_generation:tier:fast"], defaultTtlMs: 2592000000 }
      - { id: "APP_CREDITS:free-weekly",  asset: APP_CREDITS, restriction: [unearned],   defaultTtlMs: 604800000 }
      - { id: "APP_CREDITS:free-monthly", asset: APP_CREDITS, restriction: [unearned],   defaultTtlMs: 2592000000 }
  - ref: APP_POINTS
    name: App Points
    symbol: APT
    decimals: 0
    standard: internal
    ruleSet: { settleOut: false, spendableOn: [], convertEdges: [], transfer: none }
    partitions:
      - { id: "APP_POINTS:default", asset: APP_POINTS, restriction: [], defaultTtlMs: 31536000000 }
primaryAsset: APP_CREDITS

anchor: { currency: USD, creditsPerUnit: 100 }
fx: { EUR: 1.18 }
taxBasis: gross

features:
  - { id: credits, type: credits }

accounts:
  kinds: [user]
  hierarchy: { maxDepth: 0, funding: [] }
payer:
  strategy: self
  owner: [userId]

conversions:
  - id: eur-to-credits
    from: EUR
    to: APP_CREDITS
    rail: stripe
    mint: { partition: "APP_CREDITS:purchased" }
    bonus:
      strategy: tiered-lots/v1
      partition: "APP_CREDITS:bonus"
      tiers: [[5000, 30], [2500, 30], [1000, 20], [500, 10], [0, 0]]
    enabled: true
  - id: points-to-credits
    from: APP_POINTS
    to: APP_CREDITS
    rate: { kind: fixed, ratio: 1 }
    mint: { partition: "APP_CREDITS:grant" }
    enabled: false

offers:
  - { id: credits_200,  price: { model: prepaid-pool, amountMinor: 200,  currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: app_credits_200 } } }
  - { id: credits_550,  price: { model: prepaid-pool, amountMinor: 500,  currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: app_credits_550 } } }
  - { id: credits_1200, price: { model: prepaid-pool, amountMinor: 1000, currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: app_credits_1200 } } }
  - { id: credits_2400, price: { model: prepaid-pool, amountMinor: 2000, currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: app_credits_2000 } } }
  - { id: credits_7500, price: { model: prepaid-pool, amountMinor: 5000, currency: EUR }, convert: eur-to-credits, rail: { stripe: { lookupKey: app_credits_7500 } } }
  - id: starter_month_eur
    price: { model: subscription, amountMinor: 500, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 60000, partition: "APP_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: app_starter_monthly_eur } }
  - id: starter_month_usd
    price: { model: subscription, amountMinor: 500, currency: USD, interval: month }
    includes: [ { feature: credits, amountMinor: 60000, partition: "APP_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: app_starter_monthly_usd } }
  - id: plus_month_eur
    price: { model: subscription, amountMinor: 2000, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 270000, partition: "APP_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: app_plus_monthly_eur } }
  - id: plus_month_usd
    price: { model: subscription, amountMinor: 2000, currency: USD, interval: month }
    includes: [ { feature: credits, amountMinor: 270000, partition: "APP_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: app_plus_monthly_usd } }
  - id: max_month_eur
    price: { model: subscription, amountMinor: 6000, currency: EUR, interval: month }
    includes: [ { feature: credits, amountMinor: 900000, partition: "APP_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: app_max_monthly_eur } }
  - id: max_month_usd
    price: { model: subscription, amountMinor: 6000, currency: USD, interval: month }
    includes: [ { feature: credits, amountMinor: 900000, partition: "APP_CREDITS:subscription", rollover: none } ]
    subscription: { anchor: calendar, grace: P7D, onUpgrade: none }
    rail: { stripe: { lookupKey: app_max_monthly_usd } }

grants:
  - id: welcome
    trigger: { kind: manual }
    amount: { strategy: "x-acme:welcome-by-country" }
    partition: "APP_CREDITS:welcome"
    expires: { after: P30D }
    key: "{account}:once"
  - id: free-weekly-topup
    trigger: { kind: cron, cron: "0 12 * * 6", timezone: Europe/Paris }
    eligible: { plans: [none] }
    amount: { fixedMinor: 1000 }
    mode: top-up
    partition: "APP_CREDITS:free-weekly"
    key: "{account}:{period}"
  - id: free-dotation
    trigger: { kind: manual }
    eligible: { plans: [none] }
    amount: { fromContext: true }
    partition: "APP_CREDITS:free-monthly"
    key: "{account}:{period}"

rails:
  - { id: stripe, productTag: consumer-app }
---

# Consumer app

Exercises fixed credit packs with tiered bonuses (separate `bonus` lot per rule
12), a disabled non-fiat `points-to-credits` conversion still checked by
`verifyNoArbitrage`, monthly subscriptions in EUR and USD with calendar anchor
and 7-day grace, a timezone-aware weekly `top-up` grant, and a vendor grant
strategy.

Trace of a 20 EUR pack under the anchor (`100 USD`, `fx.EUR = 1.18`): `mint
2000 EUR` (cause `stripe:pi_...`), conversion to `236 000` hundredths in
`purchased`, `mint 47 200` in `bonus` (20% tier): 2 832 credits total, all
carrying the same `cause`.
