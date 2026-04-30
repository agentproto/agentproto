# EXAMPLES.md — INTENT.md reference patterns

Reference `INTENT.md` files exemplifying common patterns. Each example is a
self-contained manifest a host could load as-is. Authors should copy the
closest pattern and edit fields rather than draft from scratch.

## Patterns covered

1. [Single-tool intent (simplest)](#1-single-tool-intent-simplest)
2. [Multi-tool routing by input](#2-multi-tool-routing-by-input)
3. [Plan-aware routing via custom entry](#3-plan-aware-routing-via-custom-entry)
4. [Workflow intent (multi-step)](#4-workflow-intent-multi-step)
5. [Read-only catalog intent (no inputs)](#5-read-only-catalog-intent-no-inputs)
6. [Voice-first intent](#6-voice-first-intent)
7. [Fully-localised intent (i18n)](#7-fully-localised-intent-i18n)
8. [A/B experiment intent](#8-ab-experiment-intent)

---

## 1. Single-tool intent (simplest)

The default case: an intent that maps 1:1 to a tool. The intent layer adds the
user-facing label, intent seeds, surfaces, and UX-shaped inputs; the tool stays
unchanged.

```md
---
name: Send invoice
id: invoice.send
label: { en: "Send invoice" }
description:
  en: "Email an invoice to a customer. Uses the invoice they confirmed in the previous step."
version: 1.0.0
intent:
  - "send the invoice"
  - "email the invoice to the customer"
surfaces: [chat, menu]
inputs:
  - name: invoiceId
    label: { en: "Invoice" }
    type: ref                     # AIP-27 ref picker
    accept: ["invoice"]
    required: true
  - name: cc
    label: { en: "CC (optional)" }
    type: text
    placeholder: { en: "manager@acme.com" }
    required: false
implements:
  - tool: ./tools/stripe-send-invoice/TOOL.md
    default: true
quota_key: billing.invoice.send
tags: [billing, customer-comms]
examples:
  - user: { en: "send the invoice we just drafted to David" }
---

## When to use

After the user has confirmed an invoice draft. Do NOT use to *create* the
invoice — that's `invoice.create`.

## Behaviour

The form pre-fills `invoiceId` with the most recent draft from the conversation.
Submitting fires the Stripe API call; on success the surface renders the
invoice's hosted-URL link inline.
```

---

## 2. Multi-tool routing by input

The intent picks between two tools based on a user-input value. Routing is
declared as data (no entry file required).

```md
---
name: Create image
id: image.create
label: { en: "Create an image", fr: "Créer une image" }
description:
  en: "Generate an image from a text prompt. Picks the best model for the chosen style."
  fr: "Génère une image à partir d'un texte. Choisit le meilleur modèle selon le style."
version: 1.0.0
intent:
  - "create/make/generate an image"
  - "draw a picture of …"
  - "génère/crée une image"
surfaces: [chat, menu]
quota_key: ai.image.create
inputs:
  - name: prompt
    label: { en: "What to draw", fr: "Que dessiner" }
    type: textarea
    required: true
    max_length: 500
  - name: style
    label: { en: "Style", fr: "Style" }
    type: choice
    values:
      - { value: photorealistic, label: { en: "Photorealistic", fr: "Photoréaliste" } }
      - { value: watercolor,     label: { en: "Watercolor", fr: "Aquarelle" } }
      - { value: illustration,   label: { en: "Illustration", fr: "Illustration" } }
    default: photorealistic
  - name: aspect
    label: { en: "Aspect ratio" }
    type: choice
    values: ["1:1", "16:9", "4:3", "9:16"]
    default: "1:1"
implements:
  - tool: ./tools/replicate-flux-pro/TOOL.md
    when: { style: photorealistic }
    mapping:
      prompt: prompt
      aspect: aspect_ratio
  - tool: ./tools/openai-dalle/TOOL.md
    default: true
    mapping:
      prompt: prompt
      aspect:
        from: aspect
        transform: aspect_to_size   # named transformer in intent.ts
outputs:
  type: image
preview: ./previews/image-create.png
tags: [media, generative-ai]
---

## Routing

`photorealistic` → Flux Pro (dominant on photoreal benchmarks at the price
point we pay). All other styles → DALL-E (faster on 1:1 / 16:9 outputs and
materially cheaper for stylised generations).
```

---

## 3. Plan-aware routing via custom entry

When routing depends on the **caller's context** (user tier, locale, capability)
rather than just inputs, declare an `entry` and ship a `route()` function. The
frontmatter's `implements:` is omitted — the entry returns the ref.

`INTENT.md`:

```md
---
name: Create image
id: image.create
label: { en: "Create an image" }
description:
  en: "Generate an image. Routes by plan and style — free plans use the fast variant."
version: 1.1.0
intent:
  - "create an image"
surfaces: [chat, menu]
inputs:
  - name: prompt
    label: { en: "What to draw" }
    type: textarea
    required: true
  - name: style
    label: { en: "Style" }
    type: choice
    values: [photorealistic, watercolor, illustration]
    default: photorealistic
implements:
  - entry: intent.ts                # custom routing
quota_key: ai.image.create
preview: ./previews/image-create.png
---

## Behaviour

Free plans always route to Flux Schnell (cheap, ~2s). Paid plans route to
Flux Pro for photorealistic and DALL-E for stylised outputs.
```

`intent.ts`:

```ts
import { defineIntent } from "@agentproto/intent-runtime"

type Input = { prompt: string; style: "photorealistic" | "watercolor" | "illustration" }

export default defineIntent<Input>({
  id: "image.create",
  label: { en: "Create an image" },
  description: { en: "Generate an image." },
  surfaces: ["chat", "menu"],
  intent: ["create an image"],
  inputs: [
    { name: "prompt", label: { en: "What to draw" }, type: "textarea", required: true },
    { name: "style",  label: { en: "Style" }, type: "choice",
      values: ["photorealistic", "watercolor", "illustration"], default: "photorealistic" },
  ],
  route: ({ input, context, signal }) => {
    void signal
    if (context.user?.tier === "free") {
      return { tool: "./tools/replicate-flux-schnell/TOOL.md" }
    }
    if (input.style === "photorealistic") {
      return { tool: "./tools/replicate-flux-pro/TOOL.md", mapping: { prompt: "prompt" } }
    }
    return { tool: "./tools/openai-dalle/TOOL.md", mapping: { prompt: "prompt" } }
  },
})
```

---

## 4. Workflow intent (multi-step)

When the intent triggers more than one tool in sequence, route to a workflow
manifest ([AIP-15](/docs/aip-15)) rather than chaining inline. The intent
remains the user-facing entry; orchestration belongs in the workflow.

```md
---
name: Create and upscale image
id: image.create-upscaled
label: { en: "Create + upscale" }
description:
  en: "Generate an image then upscale to 4K. Two-step under the hood; one button to the user."
version: 1.0.0
intent:
  - "create a high-resolution image"
  - "make an upscaled image"
surfaces: [menu]
inputs:
  - name: prompt
    label: { en: "What to draw" }
    type: textarea
    required: true
  - name: target_resolution
    label: { en: "Target resolution" }
    type: choice
    values: ["2K", "4K"]
    default: "4K"
implements:
  - workflow: ./workflows/image-create-and-upscale/WORKFLOW.md
    default: true
quota_key: ai.image.create-upscaled
cost_class: expensive             # surfaces SHOULD warn before invoking
tags: [media, generative-ai, premium]
---

## When to use

Surface only on plans that can afford two generations + one upscale. Reserved
for the menu surface; chat surface keeps `image.create` (single-step) as the
default fast path.
```

---

## 5. Read-only catalog intent (no inputs)

Some intents take no inputs — they list, summarise, or open a view. UX is just
"click the button".

```md
---
name: List open PRs
id: github.pr.list-open
label: { en: "Open PRs" }
description:
  en: "Show your open pull requests across all watched repos."
version: 1.0.0
intent:
  - "list my open PRs"
  - "what PRs do I have open"
  - "show pending pull requests"
surfaces: [chat, menu, voice]
implements:
  - tool: ./tools/gh-pr-list-mine/TOOL.md
    default: true
outputs:
  type: markdown                  # tool returns a rendered list
quota_key: read.github.pr
tags: [github, pr, read-only]
examples:
  - user: { en: "what PRs do I have open?" }
  - user: { en: "list my open pull requests" }
---

## Behaviour

The result is a markdown list grouped by repo. Each row links to the PR's
GitHub URL. No inputs — the surface invokes immediately on click.
```

---

## 6. Voice-first intent

Voice surfaces add constraints: confirmation prompts, terse replies, no
multi-line forms. Authors declare voice-specific copy via `metadata.voice`.

```md
---
name: Add to shopping list
id: shopping.list.add
label: { en: "Add to shopping list" }
description:
  en: "Append an item to the shared household shopping list."
version: 1.0.0
intent:
  - "add X to the shopping list"
  - "remember to buy X"
  - "ajoute X à la liste de courses"
surfaces: [voice, chat, shortcut]
inputs:
  - name: item
    label: { en: "Item" }
    type: text
    required: true
  - name: quantity
    label: { en: "Quantity" }
    type: text
    required: false
    placeholder: { en: "2 lb / 500g / 1 pack" }
implements:
  - tool: ./tools/notion-list-append/TOOL.md
    default: true
metadata:
  voice:
    confirmation_template:        # what the assistant says back
      en: "Adding {{item}}{{#if quantity}} ({{quantity}}){{/if}} to the list."
      fr: "J'ajoute {{item}}{{#if quantity}} ({{quantity}}){{/if}} à la liste."
    require_explicit_confirm: false
quota_key: home.shopping.append
tags: [home, voice-friendly]
examples:
  - user: { en: "add two pints of milk to the shopping list" }
  - user: { fr: "ajoute du pain à la liste de courses" }
---

## Behaviour

Voice surface: assistant confirms verbally with the template, executes, then
acknowledges with a short "done". No screen.

Chat / shortcut surfaces: a one-line form with `item` + optional `quantity`.
```

---

## 7. Fully-localised intent (i18n)

Every user-visible field is a per-locale map. Authors who ship to en / fr / es /
ar all four locales should set this pattern as the default.

```md
---
name: Schedule meeting
id: calendar.meeting.create
label:
  en: "Schedule meeting"
  fr: "Planifier une réunion"
  es: "Programar reunión"
  ar: "جدولة اجتماع"
description:
  en: "Create a calendar event with the people in this conversation."
  fr: "Crée un événement de calendrier avec les personnes de cette conversation."
  es: "Crea un evento de calendario con las personas de esta conversación."
  ar: "أنشئ حدثاً في التقويم مع الأشخاص في هذه المحادثة."
version: 1.0.0
intent:
  en: ["schedule a meeting", "book a call", "set up a meeting with X"]
  fr: ["planifie une réunion", "organise un appel", "réserve une réunion avec X"]
  es: ["programa una reunión", "reserva una llamada"]
  ar: ["جدولة اجتماع", "حجز مكالمة"]
surfaces: [chat, menu]
inputs:
  - name: title
    label:
      en: "Title"
      fr: "Titre"
      es: "Título"
      ar: "العنوان"
    type: text
    required: true
    max_length: 200
  - name: when
    label:
      en: "When"
      fr: "Quand"
      es: "Cuándo"
      ar: "متى"
    type: text                    # natural-language date; tool parses
    required: true
    placeholder:
      en: "tomorrow at 3pm"
      fr: "demain à 15h"
      es: "mañana a las 15"
      ar: "غداً الساعة 3 مساءً"
  - name: duration
    label:
      en: "Duration"
      fr: "Durée"
      es: "Duración"
      ar: "المدة"
    type: choice
    values:
      - { value: 15, label: { en: "15 min", fr: "15 min", es: "15 min", ar: "15 دقيقة" } }
      - { value: 30, label: { en: "30 min", fr: "30 min", es: "30 min", ar: "30 دقيقة" } }
      - { value: 60, label: { en: "1 hour", fr: "1 heure", es: "1 hora", ar: "ساعة" } }
    default: 30
implements:
  - tool: ./tools/google-calendar-create/TOOL.md
    default: true
quota_key: productivity.calendar.create
tags: [productivity, calendar, i18n-complete]
---

## When to use

When the user asks to schedule a meeting and there's enough context in the
conversation to infer attendees. Otherwise prompt for missing fields via the
form.
```

---

## 8. A/B experiment intent

Sometimes the routing decision is the experiment. Use `experiments:` to ship
multiple arms with weights; the runtime picks per session/user.

```md
---
name: Summarise document
id: doc.summarise
label: { en: "Summarise" }
description:
  en: "Generate a summary of the open document."
version: 1.0.0
intent: ["summarise this", "tldr"]
surfaces: [chat, shortcut]
inputs:
  - name: document
    label: { en: "Document" }
    type: ref
    accept: ["file", "url"]
    required: true
implements:
  - tool: ./tools/anthropic-summarise/TOOL.md     # control / default
    default: true
experiments:
  - id: gemini-summariser-v1
    weight: 0.2
    when: { document.type: { in: [pdf, docx] } }   # only on long docs
    implements:
      - tool: ./tools/gemini-summarise/TOOL.md
        default: true
  - id: claude-haiku-summariser
    weight: 0.1
    implements:
      - tool: ./tools/anthropic-haiku-summarise/TOOL.md
        default: true
quota_key: ai.summarise
tags: [productivity, experiment]
metadata:
  experiment:
    primary_metric: user_satisfaction_thumbs
    decision_window: P14D
---

## Experiment

Three-arm test against the Anthropic Sonnet baseline:

- **Arm 1 (gemini)**: tests Gemini 2.5 Pro on long PDFs/DOCX (where it leads).
- **Arm 2 (claude-haiku)**: tests cheap-fast for short docs.
- **Control (default)**: Anthropic Sonnet, today's behaviour.

Weight 0.7 control / 0.2 gemini / 0.1 haiku. 14-day decision window on
thumbs-up rate.
```

---

## Anti-patterns

A few things authors are tempted to do but should NOT:

- **Inline schema definitions in `inputs`.** UX inputs aren't JSON Schema. If
  the validation rule doesn't fit the listed v1 options (`min`, `max`,
  `pattern`, `min_length`, `max_length`, `values`), the validation belongs
  inside the tool — not in the intent.

- **Tool chaining inside a custom `route()` function.** `route()` returns a
  ref; it does not call tools. Multi-step → use a workflow.

- **Per-intent auth declarations.** Auth lives in the routed tool's
  [SECRETS.md](/docs/aip-19) ref. Declaring auth at the intent level only
  makes sense when the *routing logic itself* needs auth (rare).

- **Mutable `id`.** `id` + major version is the registration key. Renaming is
  a breaking change and requires a major bump + an alias for the legacy id
  during deprecation.

- **Surface-specific copy in `description`.** If chat needs a different intro
  than menu, use `metadata.<surface>.…` overrides — don't fork the intent.
