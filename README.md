# agentproto

Open standards for the AI-agent ecosystem — AIP (Agent Improvement
Proposal) specifications. The standards body for the agentproto
ecosystem.

> **Status: 0.1.0-alpha.** Specs are stabilising; expect minor breaking
> changes between alpha releases.

## What's in this repo

This repo contains **markdown specifications only**. TypeScript reference
implementations live in [`agentproto/ts`](https://github.com/agentproto/ts);
the rendered docs site lives at [`agentproto/site`](https://github.com/agentproto/site).

```
agentproto/
└── specs/                AIP markdown specifications
    ├── aip-1.mdx ... aip-N.mdx
    └── resources/        canonical artifacts (SKILL.md, *.schema.json, EXAMPLES.md, ...)
```

The three-repo split:

| Repo | Contents | License |
|---|---|---|
| [`agentproto/agentproto`](https://github.com/agentproto/agentproto) | Markdown AIP specs + conformance suites + RFCs | CC-BY-4.0 |
| [`agentproto/ts`](https://github.com/agentproto/ts) | TypeScript runtime + adapters | MIT |
| [`agentproto/site`](https://github.com/agentproto/site) | Next.js renderer at agentproto.sh | MIT |

## Browse the specs

Rendered at <https://agentproto.sh/docs>.

Key specs:

- [AIP-14 — TOOL.md](https://agentproto.sh/docs/aip-14)
- [AIP-30 — DRIVER.md](https://agentproto.sh/docs/aip-30)
- [AIP-29 — CLI.md](https://agentproto.sh/docs/aip-29)
- [AIP-17 — RUNNER.md](https://agentproto.sh/docs/aip-17)

## Contributing a new AIP

```bash
git clone https://github.com/agentproto/agentproto
cd agentproto
git checkout -b propose-<your-slug>
# Copy the template, fill in frontmatter + 7 required sections
$EDITOR specs/aip-XXXX.mdx
git push origin propose-<your-slug>
gh pr create
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full submission guide.

## License

AIP markdown specifications are licensed under [CC-BY-4.0](./LICENSE-AIPs).
Code samples embedded in specs are MIT (see [LICENSE-code](./LICENSE-code)).
