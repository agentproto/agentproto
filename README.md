# agentproto

**Open numbered standards for the markdown files agents read, write, and run from.**

> Code freezes intent at compile time. Text re-interprets it on every run.

**AIP** = **A**gentproto **I**mprovement **P**roposal. Same model as ERCs (Ethereum), BIPs (Bitcoin), PEPs (Python) — but for agents.

> **Status: 0.1.0-alpha.** Specs are stabilising; expect minor breaking changes between alpha releases.

Rendered docs: <https://agentproto.sh/docs>

---

## The moment

Every serious agent system is converging on the same shape: a folder of markdown files the agent reads, writes, and runs from. `AGENTS.md` (OpenAI Codex), `CLAUDE.md` (Anthropic), `SKILL.md` (Anthropic Agent Skills, open-sourced Dec 2025 and adopted by Codex), `AGENT.md` (Sourcegraph Amp), `GEMINI.md` (Google), and a long tail of `COMPANY.md`, `DESIGN.md`, `BRAIN.md`, `SOUL.md` shipping every week.

This works because filesystem + CLI + data in one place is the most natural element an LLM can evolve in. But it's where Ethereum was before ERC-20: everyone shipping the same primitive, slightly differently, with zero interop. Is it `skill.title` or `skill.name`? Does `AGENTS.md` mean Codex's flavour, Cursor's flavour, or yours?

AIPs are the registry. One numbered spec per primitive, one place to look it up, one shared vocabulary across runtimes. Specs are *aligned with* the de-facto standards they grow out of, not forks of them — AIP-3 codifies `SKILL.md` as Anthropic shipped it, AIP-9 captures the operator-profile pattern most teams already converged on.

## What a spec looks like

A spec is just a markdown file with YAML frontmatter. Here's the shape of an [AIP-3 SKILL.md](https://agentproto.sh/docs/aip-3):

```yaml
---
schema: skills/v1
name: extract-invoice
title: Extract structured invoice data
description: Parses a PDF or image invoice into a typed record.
version: 1.0.0
tags: [finance, ocr]
inputs:
  - name: path
    type: string
    required: true
    description: Absolute path to the invoice file.
tools:
  - pdf-read
  - ocr
---

# Instructions

Read the file at {{ input.path }}, OCR if it's an image, and return
{ vendor, total, currency, line_items[] }. If the document isn't an
invoice, return { error: "not_an_invoice" } — don't hallucinate fields.
```

That file loads in any AIP-compliant runtime — Mastra, ai-sdk, Claude, your own — without rewriting.

## The payoff: agents that author their own components

Naming things consistently is the table stakes. The real prize is that **an agent can read, write, and modify its own component files**, because every component is a markdown file with a declared contract.

[AIP-14 TOOL.md](https://agentproto.sh/docs/aip-14) declares a tool's *contract* — schemas, side-effects, approval class. [AIP-30 DRIVER.md](https://agentproto.sh/docs/aip-30) declares an *implementation*. One TOOL.md can have many DRIVERs (OpenAI, Replicate, local); the runtime picks one by policy, cost, or region. So an agent can:

- **Add a new tool** by writing a TOOL.md + DRIVER.md to disk.
- **Fix a bug** by editing the DRIVER body.
- **Swap an OpenAI call for a Replicate one** by adding a second DRIVER and updating policy — no caller change.
- **Deploy itself** by running its own CLI driver against its own files.

Memory ([AIP-10 KNOWLEDGE](https://agentproto.sh/docs/aip-10), [AIP-11 LESSON](https://agentproto.sh/docs/aip-11)), runtime ([AIP-30 DRIVER](https://agentproto.sh/docs/aip-30)), governance ([AIP-7 GOVERNANCE](https://agentproto.sh/docs/aip-7)), work backlog ([AIP-13 WORK](https://agentproto.sh/docs/aip-13)) — all files, all in reach. Self-modification stops being a research problem and becomes a `write_file` call.

## The registry

The 33 specs organise into 8 semantic layers. Read in this order if you're new — each layer answers a single question about agents.

| # | Layer | Question | Key AIPs |
|---|---|---|---|
| 1 | **Process** | How does the standard itself evolve? | [AIP-1](https://agentproto.sh/docs/aip-1) Purpose · [AIP-2](https://agentproto.sh/docs/aip-2) Template |
| 2 | **Primitives** | What building blocks does everything else compose with? | [AIP-16](https://agentproto.sh/docs/aip-16) IO · [AIP-17](https://agentproto.sh/docs/aip-17) RUNNER · [AIP-18](https://agentproto.sh/docs/aip-18) COLLECTION · [AIP-19](https://agentproto.sh/docs/aip-19) SECRETS · [AIP-27](https://agentproto.sh/docs/aip-27) REF |
| 3 | **Identity** | Who acts? | [AIP-9](https://agentproto.sh/docs/aip-9) OPERATOR · [AIP-23](https://agentproto.sh/docs/aip-23) IDENTITY · [AIP-25](https://agentproto.sh/docs/aip-25) PERSONA |
| 4 | **Memory** | What does the agent remember between runs? | [AIP-10](https://agentproto.sh/docs/aip-10) KNOWLEDGE · [AIP-11](https://agentproto.sh/docs/aip-11) LESSON · [AIP-12](https://agentproto.sh/docs/aip-12) PLAYBOOK |
| 5 | **Work, Org & Governance** | What gets done, where, and under what rules? | [AIP-6](https://agentproto.sh/docs/aip-6) COMPANY · [AIP-7](https://agentproto.sh/docs/aip-7) GOVERNANCE · [AIP-8](https://agentproto.sh/docs/aip-8) / [AIP-21](https://agentproto.sh/docs/aip-21) AGENCY · [AIP-13](https://agentproto.sh/docs/aip-13) / [AIP-20](https://agentproto.sh/docs/aip-20) WORK · [AIP-22](https://agentproto.sh/docs/aip-22) OFFICE · [AIP-24](https://agentproto.sh/docs/aip-24) ASSEMBLY |
| 6 | **Capabilities** | What can the agent do? | [AIP-3](https://agentproto.sh/docs/aip-3) SKILL · [AIP-14](https://agentproto.sh/docs/aip-14) TOOL · [AIP-15](https://agentproto.sh/docs/aip-15) WORKFLOW · [AIP-28](https://agentproto.sh/docs/aip-28) INTENT |
| 7 | **Drivers** | How are capabilities actually implemented? | [AIP-30](https://agentproto.sh/docs/aip-30) DRIVER · [AIP-29](https://agentproto.sh/docs/aip-29) CLI · [AIP-31](https://agentproto.sh/docs/aip-31) HTTP · [AIP-32](https://agentproto.sh/docs/aip-32) MCP · [AIP-33](https://agentproto.sh/docs/aip-33) SDK |
| 8 | **Surfaces** | What does the agent produce or read? | [AIP-4](https://agentproto.sh/docs/aip-4) DESIGN · [AIP-5](https://agentproto.sh/docs/aip-5) CANVAKIT · [AIP-26](https://agentproto.sh/docs/aip-26) CODE |

Full registry with statuses and `requires:` chains: <https://agentproto.sh/docs>.

## Start with these four

If you only have time for four:

1. **[AIP-1](https://agentproto.sh/docs/aip-1)** — Purpose & process. Why the registry exists, how specs evolve.
2. **[AIP-9](https://agentproto.sh/docs/aip-9)** — `OPERATOR.md`. The shell that ties identity, memory, capabilities, governance.
3. **[AIP-7](https://agentproto.sh/docs/aip-7)** — `GOVERNANCE.md`. How approvals, audit logs, and autonomy policies are recorded as files.
4. **[AIP-14](https://agentproto.sh/docs/aip-14)** — `TOOL.md`. The abstract tool contract every driver subtype specialises.

Then dive into whichever layer matches your current problem.

## Use it

- **TypeScript runtime** — [`agentproto/ts`](https://github.com/agentproto/ts). Packages: `@agentproto/tool` (AIP-14), `@agentproto/driver` (AIP-30), `@agentproto/agencies` (AIP-8), `@agentproto/governance` (AIP-7), `@agentproto/ref` (AIP-27). Framework adapters live alongside (`adapters/mastra`, `adapters/ai-sdk`).
- **Docs site** — [`agentproto/site`](https://github.com/agentproto/site) renders this repo's `specs/` at <https://agentproto.sh>.
- **Embed an AIP in your project** — every spec page has a "Copy" button; the markdown is portable.

## Contributing a new AIP

```bash
git clone https://github.com/agentproto/agentproto
cd agentproto
git checkout -b propose-<your-slug>
# Copy AIP-2 as the template
cp specs/aip-2.mdx specs/aip-XXXX.mdx
$EDITOR specs/aip-XXXX.mdx
# Fill: title, description, aip number, status: Draft, requires:[…], layer:<slug>
# Then the seven required sections (Abstract → Security Considerations).
git push origin propose-<your-slug>
gh pr create
```

The `layer:` frontmatter places your AIP in the right registry section. Slugs: `process`, `primitives`, `identity`, `memory`, `coordination`, `capabilities`, `drivers`, `surfaces`. Untagged AIPs land in a "Misc" bucket — useful for early drafts, expected to be assigned a layer before Review.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full submission guide and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community expectations.

## FAQ

**Is this an MCP replacement?** No. MCP solves *tool transport*. AIPs specify the layer above transport, below frameworks: where context lives, roles are defined, memory is structured. A TOOL.md contract can be served over MCP, HTTP, CLI, or in-process — that's the DRIVER layer's job ([AIP-30](https://agentproto.sh/docs/aip-30) – [AIP-33](https://agentproto.sh/docs/aip-33)).

**Is this an A2A replacement?** No. A2A solves agent-to-agent comms. AIPs are about how a single agent's components are structured on disk.

**Why markdown, not YAML or JSON?** Because the agent reads the file every turn. A SKILL.md instruction can say *"if the document isn't an invoice, return `{ error: 'not_an_invoice' }` — don't hallucinate fields"* and the LLM behaves accordingly the next time it runs. The same intent expressed in JSON is dead data; expressed as a Python function it's locked into a release. Frontmatter holds the typed fields machines need; prose holds the behavioural semantics the model reads.

## The three repos

| Repo | Contents | License |
|---|---|---|
| [`agentproto/agentproto`](https://github.com/agentproto/agentproto) | Markdown AIP specs + canonical resources + RFCs | CC-BY-4.0 |
| [`agentproto/ts`](https://github.com/agentproto/ts) | TypeScript reference runtime + adapters | MIT |
| [`agentproto/site`](https://github.com/agentproto/site) | Next.js renderer at agentproto.sh | MIT |

This repo (the one you're reading) holds the **markdown specs only** — no code.

```
agentproto/
└── specs/
    ├── index.mdx           docs landing
    ├── aip-1.mdx ... aip-N.mdx
    └── resources/          canonical artifacts (SKILL.md, *.schema.json, EXAMPLES.md, ADAPTER.md, ...)
```

## License

| What | License |
|---|---|
| AIP markdown specifications (this repo's `specs/`) | [CC-BY-4.0](./LICENSE-AIPs) |
| Code samples embedded in specs | [MIT](./LICENSE-code) |
| Reference TypeScript runtime ([`agentproto/ts`](https://github.com/agentproto/ts)) | MIT |

The two-license split mirrors how RFCs and W3C documents work: the *standard* is freely shareable and adaptable; the *implementation code* is permissively licensed for downstream use.
