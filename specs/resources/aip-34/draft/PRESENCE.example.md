---
schema: presence/v1
name: shopbot-presence
title: ShopBot public presence
description: >-
  How ShopBot speaks on LinkedIn and X: who it talks to, which topics, which
  words never appear, how often, and who approves each piece before it leaves.
  Extends the Acme company defaults and changes only what is specific to the
  product.
version: 0.1.0
status: draft
extends: ../../acme-brand/presence/PRESENCE.md
persona: ./PERSONA.md
audience:
  primary: Store owners who sell on a hosted shop platform and have no developer.
  pains:
    - Product pages that AI assistants cannot read
    - No way to tell whether the shop shows up in AI answers
  notTargeted:
    - Agencies looking for a white-label resale
topics:
  pillars:
    - id: ai-visibility
      title: Being found by AI assistants
      angle: One measured fact about a real shop, then what to change.
    - id: build-notes
      title: Build notes
      angle: What shipped this week and what it changed for a shop owner.
  exclude:
    - Competitor pricing
    - Unreleased features
lexicon:
  forbidden:
    - term: guaranteed ranking
      reason: Nobody can guarantee a position in an AI answer.
      instead: Say what was measured and when.
  required:
    - phrase: "Launch offer: first month free"
      context: Whenever a post or comment mentions the price or the offer.
channels:
  - id: linkedin-owner
    network: linkedin
    cadence:
      posts: { perWeek: 3, maxPerDay: 1 }
      comments: { perDay: 5 }
      window: { days: [mon, tue, wed, thu, fri], hours: "08:00-10:00", timezone: Europe/Paris }
watch:
  keywords: [AI shopping, agentic commerce, product feed]
  hashtags: ["#ecommerce"]
  commentRules:
    - A comment adds one fact or one precise question. It sells nothing.
gates:
  - id: public-site-stale
    description: The public landing page still shows claims that the product no longer makes.
    status: open
    blocks: [links]
examples:
  good:
    - channel: linkedin-owner
      text: "We scanned 40 shop pages for the data AI assistants read. 31 had no product schema at all. The fix takes one template change."
      why: One measured fact, one action, no adjective.
  bad:
    - channel: linkedin-owner
      text: "Our revolutionary platform unlocks your shop's full potential."
      why: Superlative with no fact behind it.
review:
  cadence: weekly
  day: mon
  kpis: [posts published, comments published, replies received, pieces refused]
---

# ShopBot public presence

The body is free-form markdown for humans. Hosts read only the frontmatter.
