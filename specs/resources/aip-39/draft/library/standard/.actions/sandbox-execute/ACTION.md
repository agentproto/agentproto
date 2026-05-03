---
schema: action/v1
id: sandbox:execute
version: 1.0.0
description: "Execute a shell command inside a sandbox. The sandbox's `mounts` define filesystem reach; the sandbox's `network.egress` defines network reach."
category: compute
verb: execute
target_kind: sandbox
mutates: ["sandbox:*"]
risk_level: 2
approval: on-mutate
fires_events: ["sandbox-command-started", "sandbox-command-completed"]
tags: [compute, shell, runtime]
examples:
  - name: Agent runs a build
    scenario: "Agent calls `npm run build` to verify a code change. Output captured, exit code returned, no persistent side effects beyond mounted filesystems."
  - name: Long-running daemon
    scenario: "Agent spawns a dev server. Implementor's `get_process_output` action retrieves logs; `kill_process` ends it."
---

## Description

Use to run arbitrary shell commands in a sandbox environment. The
specific environment depends on the SANDBOX.md `provider` (local,
e2b, modal, daytona, ...). Implementors typically wrap Mastra's
`MastraSandbox.executeCommand`.

## Side effects

`mutates: sandbox:*` — anything in the sandbox's reachable filesystem
or network. Bound by SANDBOX.md `mounts` (where the sandbox can write)
and `network.egress` (where it can reach).

## Approval rationale

`approval: on-mutate` — command execution is high-trust. Implementors
MAY narrow to `always` for production sandboxes or relax to `auto`
for read-only command sets (`ls`, `cat`).
