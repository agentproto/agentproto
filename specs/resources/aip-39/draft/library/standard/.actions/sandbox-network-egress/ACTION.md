---
schema: action/v1
id: sandbox:network-egress
version: 1.0.0
description: "Make outbound network calls from a sandbox. Distinct from `sandbox:execute` because network policy is independently grantable (a sandbox MAY execute commands without internet)."
category: compute
verb: network-egress
target_kind: sandbox
mutates: ["network:*"]
risk_level: 2
approval: on-mutate
fires_events: ["network-egress"]
requires:
  network: ["*"]
tags: [compute, network, egress]
examples:
  - name: Agent fetches public docs
    scenario: "Agent runs `curl https://docs.foo.com` from sandbox. Egress destination matches SANDBOX.md.network.egress allow-list."
---

## Description

Use to declare network-egress capability separately from command
execution. A workspace MAY grant `sandbox:execute` without
`sandbox:network-egress` to allow offline command runs only.

## Side effects

`mutates: network:*` — outbound traffic to allowed hosts. Bound by
SANDBOX.md `network.egress` allow-list.

## Approval rationale

`approval: on-mutate` — egress can exfiltrate. Most workspaces will
narrow to `always` or restrict via egress allow-list.
