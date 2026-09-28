# HARNESS — no AIP number assigned

`HARNESS.schema.json` in this directory was previously misfiled at
`specs/resources/aip-52/draft/HARNESS.schema.json`. AIP-52 is
[ADAPTER](/docs/aip-52) (`FrameworkAdapter` — the outward bridge from
an agentproto handle into a foreign framework); its prose never
mentions a Harness, and its frontmatter never claims a `resources:`
directory. The schema landed in that path by naming-convention
accident only, and the ts code's `packages/pack` claim on `aip: 52`
compounded the confusion (see `.plans/review-primitive/ARCH-AUDIT.md`
§0 headline 1).

A Harness — a stateful conversational shell with modes, threads,
tool-approval gates, subagents, and observational memory — is not
covered by any existing AIP:

- It is explicitly **not** a subtype of [AIP-42](/docs/aip-42) AGENT
  (see the schema's own `$comment`) — a Harness *has* agents, it
  isn't one.
- [AIP-45](/docs/aip-45) AGENT-CLI covers installing and talking to an
  **external agent CLI binary** as a subprocess (Claude Code, Hermes,
  …) — a different `HarnessAdapter` sense entirely (see AIP-52
  §Terminology reconciliation), not this in-process, multi-mode
  conversational state machine.
- [AIP-46](/docs/aip-46) AGENT-SESSIONS covers a daemon's
  spawn/observe/kill control plane over those external CLI processes
  — orchestration, not the internal mode/thread/subagent shape a
  single agent process exposes.

No existing AIP owns this shape. This directory is a clearly-marked
holding location, not a numbered spec. It MUST be either minted as a
real AIP (with its own `specs/aip-XXXX.mdx` and a `resources/aip-XXXX`
home for this schema) or folded into an existing AIP that grows to
cover it — never left claiming a number it was never assigned.
