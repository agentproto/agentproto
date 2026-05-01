# agentproto

**Open numbered standards for the AI-agent ecosystem. Filesystem-first; markdown is the program.**

**AIP** = **A**gentproto **I**mprovement **P**roposal — the project is **agentproto** (slug; human-readable name *Agent Protocol*). Same model as BIPs (Bitcoin), EIPs (Ethereum), PEPs (Python), but for agents.

> **Status: 0.1.0-alpha.** Specs are stabilising; expect minor breaking changes between alpha releases.

Rendered docs: <https://agentproto.sh/docs>

---

## Why

Build a serious agent system and you hit the same wall everyone hits. You give an agent context, a role, instructions. It works. You try to take that *understanding* to another project, another runtime, another team. You start over — not because the agent is dumb, but because there's no shared format for what it already knows how to do.

Code freezes intent at compile time. Text re-interprets it on every run. A `LESSON.md` saying *"when a client hesitates on price, validate the problem before defending value"* works for a SaaS sales agent, a support agent, and a negotiation agent — same file, zero adaptation. Rules written as code stay coupled to the runtime that compiled them. Rules written as markdown for an agent to read are **intrinsically cross-context**.

The primitives — operator profile, accumulated lessons, governance policy, work backlog — are already generalisable by nature. What's missing is a shared format so they can travel between systems. AIPs are that format.

AIPs are not an MCP replacement (MCP solves tool transport), not an A2A replacement (A2A solves agent-to-agent comms), not a runtime replacement. They specify the layer above transport, below frameworks: where context lives, roles are defined, memory is structured.

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

## The layered model

The 33 specs in this repo organise into 8 semantic layers. Read in this order if you're new — each layer answers a single question about agents.

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

The full registry, rendered with statuses and `requires:` chains, lives at <https://agentproto.sh/docs>.

## A four-spec reading order

If you only have time for four:

1. **[AIP-1](https://agentproto.sh/docs/aip-1)** — Purpose & process. Why the registry exists, how specs evolve.
2. **[AIP-9](https://agentproto.sh/docs/aip-9)** — `OPERATOR.md`. The shell that ties together identity, memory, capabilities, governance.
3. **[AIP-7](https://agentproto.sh/docs/aip-7)** — `GOVERNANCE.md`. How approvals, audit logs, and autonomy policies are recorded as files.
4. **[AIP-14](https://agentproto.sh/docs/aip-14)** — `TOOL.md`. The abstract tool contract every driver subtype specialises.

Then dive into whichever layer matches your current problem.

## Use it

- **Reference TypeScript runtime** — [`agentproto/ts`](https://github.com/agentproto/ts). Packages: `@agentproto/tool` (AIP-14), `@agentproto/driver` (AIP-30), `@agentproto/agencies` (AIP-8), `@agentproto/governance` (AIP-7), `@agentproto/ref` (AIP-27). Framework adapters live alongside (`adapters/mastra`, `adapters/ai-sdk`, …).
- **Public docs site** — [`agentproto/site`](https://github.com/agentproto/site). Renders this repo's `specs/` at <https://agentproto.sh>.
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

The `layer:` frontmatter is what places your AIP in the right registry section. Slugs: `process`, `primitives`, `identity`, `memory`, `coordination`, `capabilities`, `drivers`, `surfaces`. Untagged AIPs land in a "Misc" bucket — useful for early drafts, expected to be assigned a layer before Review.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full submission guide and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for community expectations.

## License

| What | License |
|---|---|
| AIP markdown specifications (this repo's `specs/`) | [CC-BY-4.0](./LICENSE-AIPs) |
| Code samples embedded in specs | [MIT](./LICENSE-code) |
| Reference TypeScript runtime ([`agentproto/ts`](https://github.com/agentproto/ts)) | MIT |

The two-license split mirrors how RFCs and W3C documents work: the *standard* is freely shareable and adaptable; the *implementation code* is permissively licensed for downstream use.
