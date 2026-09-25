# vectors/ — AIP-58 conformance cases

Seven JSON fixtures, one per case named in `specs/aip-58.mdx`'s "Resources
to add" list. Each file carries a trimmed manifest excerpt, the `run.create`
input, and the expected terminal state + event sequence a conforming host
MUST produce. These are fixtures for a conformance-test harness to load,
not executable tests themselves — this AIP does not mandate a test runner.

| File | Case |
|---|---|
| `v1-invalid-input.json` | Required input missing → rejected / `failed invalid-input`, no step ran. |
| `v2-suspended-input-required.json` | Agent turn ends asking a question → step + run `suspended input-required`. |
| `v3-missing-artifact.json` | Agent turn ends, required artifact absent → `failed missing-artifact`. |
| `v4-host-restart.json` | Host restart mid-step → `failed host-interrupted`; a durably suspended run survives. |
| `v5-disjoint-workspaces.json` | Two concurrent runs of the same workflow → disjoint workspaces. |
| `v6-orphaned.json` | Run whose owner died → `failed orphaned`. |
| `v7-replay.json` | Replay from step 3 → new run, steps 1–2 reused from journal. |
