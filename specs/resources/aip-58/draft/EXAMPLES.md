# EXAMPLES.md — a full run, end to end

One worked example: a four-step [WORKFLOW.md](/docs/aip-15) workflow
(`tool`, `tool`, `agent`, `tool`) run to completion under AIP-58, shown
as the `Run` resource at rest plus the event log that produced it. Numbers
are illustrative; times are shortened for readability.

## The workflow (excerpt, per AIP-15)

```yaml
id: pricing-brief
version: 1.0.0
inputs:
  type: object
  properties:
    productUrl: { type: string, format: uri }
  required: [productUrl]
outputs:
  type: object
  properties:
    briefPath: { type: string }
  required: [briefPath]
outputsFiles:
  brief:
    path: "./briefs/<runId>.md"   # under AIP-58, this is the DEFAULT PUBLISH
                                   # destination, not an immediate sync target
                                   # — see "Publishing the result" below.
    required: true          # AIP-16 amendment — see specs/aip-16.mdx
steps:
  - id: fetch
    kind: tool
    tool: pricing-snapshot
    inputs: { productUrl: $input.productUrl }
    next: parse
  - id: parse
    kind: tool
    tool: html-to-tiers
    inputs: { html: $steps.fetch.html }
    next: draft
  - id: draft
    kind: agent
    prompt: "Write a one-page pricing brief for these tiers: $steps.parse.tiers"
    next: save
  - id: save
    kind: tool
    tool: write-file
    inputs: { path: "brief", content: $steps.draft.text }
```

## The run, mid-flight

`run.create` is called with `{ kind: "workflow", ref: { id:
"pricing-brief", version: "1.0.0", contentSha: "9f2a…" }, input: {
productUrl: "https://example.com/pricing" } }`. The host validates
`input` against the workflow's `inputs` schema, allocates the
workspace, and returns:

```json
{
  "runId": "run_01J8Z3F9K2Q7",
  "kind": "workflow",
  "ref": { "id": "pricing-brief", "version": "1.0.0", "contentSha": "9f2a…" },
  "input": { "productUrl": "https://example.com/pricing" },
  "rootRunId": "run_01J8Z3F9K2Q7",
  "status": "running",
  "steps": [
    { "stepId": "fetch", "status": "succeeded", "driver": { "kind": "tool" }, "startedAt": "…T10:00:00Z", "endedAt": "…T10:00:01Z" },
    { "stepId": "parse", "status": "running", "driver": { "kind": "tool" }, "startedAt": "…T10:00:01Z" },
    { "stepId": "draft", "status": "pending" },
    { "stepId": "save", "status": "pending" }
  ],
  "createdAt": "…T09:59:59Z",
  "startedAt": "…T10:00:00Z",
  "runner": { "hostId": "daemon-a1" },
  "artifacts": []
}
```

This is what a `run.get { runId, full: true }` returns while the run is
in flight. `run.get { runId }` (compact, the default) would return the
same `status`/timestamps/step statuses without `input`/`output` bodies.

## The run, terminal

Once `draft` (an agent step) produces text and `save` writes it as the
required `brief` artifact:

```json
{
  "runId": "run_01J8Z3F9K2Q7",
  "kind": "workflow",
  "ref": { "id": "pricing-brief", "version": "1.0.0", "contentSha": "9f2a…" },
  "input": { "productUrl": "https://example.com/pricing" },
  "rootRunId": "run_01J8Z3F9K2Q7",
  "status": "succeeded",
  "steps": [
    { "stepId": "fetch", "status": "succeeded", "driver": { "kind": "tool" }, "startedAt": "…T10:00:00Z", "endedAt": "…T10:00:01Z" },
    { "stepId": "parse", "status": "succeeded", "driver": { "kind": "tool" }, "startedAt": "…T10:00:01Z", "endedAt": "…T10:00:02Z" },
    { "stepId": "draft", "status": "succeeded", "driver": { "kind": "agent", "adapter": "claude-code", "model": "claude-sonnet-5", "sessionId": "sess_9c1e" }, "startedAt": "…T10:00:02Z", "endedAt": "…T10:00:14Z" },
    { "stepId": "save", "status": "succeeded", "driver": { "kind": "tool" }, "startedAt": "…T10:00:14Z", "endedAt": "…T10:00:14Z" }
  ],
  "createdAt": "…T09:59:59Z",
  "startedAt": "…T10:00:00Z",
  "endedAt": "…T10:00:14Z",
  "runner": { "hostId": "daemon-a1" },
  "output": { "briefPath": "briefs/run_01J8Z3F9K2Q7.md" },
  "artifacts": [
    {
      "key": "brief",
      "path": "artifacts/brief",
      "sha256": "6c9e1f…",
      "size": 1904,
      "contentType": "text/markdown",
      "stepId": "save"
    }
  ]
}
```

`output.briefPath` names the manifest's declared
`outputsFiles.brief.path` (interpolated) — the destination a
`run.publish` would write to, **not** a claim that the file already
lives there. Right now, the only copy that exists is
`artifacts/brief`, inside this run's own workspace; see [Publishing
the result](#publishing-the-result) for what moves it further.

## The event log that produced it

```json
[
  { "seq": 1,  "ts": "…T09:59:59Z", "runId": "run_01J8Z3F9K2Q7", "type": "run.created",     "data": { "kind": "workflow", "ref": { "id": "pricing-brief", "version": "1.0.0" } } },
  { "seq": 2,  "ts": "…T10:00:00Z", "runId": "run_01J8Z3F9K2Q7", "type": "run.started",     "data": {} },
  { "seq": 3,  "ts": "…T10:00:00Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "fetch", "type": "step.started",   "data": { "driver": { "kind": "tool" } } },
  { "seq": 4,  "ts": "…T10:00:01Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "fetch", "type": "step.output",    "data": { "output": { "html": "…" } } },
  { "seq": 5,  "ts": "…T10:00:01Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "fetch", "type": "step.succeeded", "data": {} },
  { "seq": 6,  "ts": "…T10:00:01Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "parse", "type": "step.started",   "data": { "driver": { "kind": "tool" } } },
  { "seq": 7,  "ts": "…T10:00:02Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "parse", "type": "step.output",    "data": { "output": { "tiers": ["Free", "Pro", "Enterprise"] } } },
  { "seq": 8,  "ts": "…T10:00:02Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "parse", "type": "step.succeeded", "data": {} },
  { "seq": 9,  "ts": "…T10:00:02Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "draft", "type": "step.started",   "data": { "driver": { "kind": "agent", "adapter": "claude-code", "sessionId": "sess_9c1e" } } },
  { "seq": 10, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "draft", "type": "step.output",    "data": { "output": { "text": "# Pricing Brief\n…" } } },
  { "seq": 11, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "draft", "type": "step.spend",     "data": { "amount": 0.014, "currency": "USD", "unit": "tokens" } },
  { "seq": 12, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "draft", "type": "step.succeeded", "data": {} },
  { "seq": 13, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "save",  "type": "step.started",   "data": { "driver": { "kind": "tool" } } },
  { "seq": 14, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "save",  "type": "step.artifact",  "data": { "key": "brief", "path": "artifacts/brief", "sha256": "6c9e1f…", "size": 1904 } },
  { "seq": 15, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "save",  "type": "step.succeeded", "data": {} },
  { "seq": 16, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "type": "run.succeeded",   "data": { "output": { "briefPath": "briefs/run_01J8Z3F9K2Q7.md" } } }
]
```

A UI following `run.events { runId, sinceSeq: 8 }` mid-run receives
exactly seq 9 onward — it never re-fetches the whole run to see what
changed, and the terminal `Run` resource shown above is nothing more
than this log folded to its final state.

## Publishing the result

The run above is `succeeded`, but `./briefs/run_01J8Z3F9K2Q7.md` does
not exist yet — only `<runsRoot>/run_01J8Z3F9K2Q7/artifacts/brief`
does. A caller (or a host auto-publish policy, §4) makes it visible
outside the run's own workspace:

```
run.publish { runId: "run_01J8Z3F9K2Q7", artifactKey: "brief" }
→ { ok: true, publishedPath: "briefs/run_01J8Z3F9K2Q7.md" }
```

Because `to` was omitted, the host used the artifact's declared
`outputsFiles.brief.path` (already interpolated at run time) as the
default. The event log gains one more entry:

```json
{ "seq": 17, "ts": "…T10:05:00Z", "runId": "run_01J8Z3F9K2Q7", "type": "run.published", "data": { "artifactKey": "brief", "to": "briefs/run_01J8Z3F9K2Q7.md" } }
```

Had the run been `running`, `suspended`, or `failed` at the time of
this call, the host would have refused it outright — `run.publish`
only ever succeeds against an already-`succeeded` run (§4).

## A variant: the agent asks a question instead

Suppose `draft`'s session, instead of writing the brief, calls
`run.requestInput { stepId: "draft", prompt: "What tone should the
brief use — formal or casual?", schema: { type: "object", properties:
{ tone: { enum: ["formal", "casual"] } }, required: ["tone"] } }` and
ends its turn there. Because this is one of the two explicit signals
§3 names, the step resolves differently:

```json
{ "seq": 10, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "stepId": "draft", "type": "step.suspended", "data": { "reason": "input-required", "prompt": "What tone should the brief use — formal or casual?", "schema": { "type": "object", "properties": { "tone": { "enum": ["formal", "casual"] } }, "required": ["tone"] } } },
{ "seq": 11, "ts": "…T10:00:14Z", "runId": "run_01J8Z3F9K2Q7", "type": "run.suspended", "data": { "stepId": "draft" } }
```

and `Run.status` is `"suspended"`, not `"succeeded"` — the run never
silently reported `done` for a question it never got an answer to. A
caller resolves it with `run.resume { runId, stepId: "draft", payload:
{ tone: "formal" } }` (validated against `stepSuspend.schema` before
it's accepted), which re-enters `draft` and continues.

**Contrast** — if `draft`'s session had instead just *said* "What tone
should the brief use — formal or casual?" as its final message,
without calling `run.requestInput` and with no AIP-46 awaiting-input
protocol event, the outcome is `failed { code: "missing-output" }`,
`StepRecord.hint: "possible-input-request"`, and `Run.status` is
`"failed"` — **not** `"suspended"`. Identical words, different call
shape, different outcome: that is the point of requiring an explicit
signal (§3). See `vectors/v8-heuristic-not-suspend.json` for the full
case.
