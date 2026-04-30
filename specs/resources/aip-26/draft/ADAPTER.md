# AIP-26 — Implementer's guide

This guide tells host implementers how to materialize a manifest's `code:` block
into a tarball, resolve `run:` to a process command, and honor the cache
invalidation contract for `github:` sources.

## Pipeline overview

```
  manifest.code (string or object)
        │
        ▼
  [string-shorthand expansion]      code: <string>  →  { sources: [{ ref: <string> }] }
        │
        ▼
  [source resolution]               for each source: produce list of (path, bytes)
        │
        ▼
  [overlay merge]                   later sources overwrite earlier ones on path collision
        │
        ▼
  [tarball creation]                tar+gzip the merged map
        │
        ▼
  [delivery]                        upload to runner / cache locally / return buffer
```

`run:` is independent of `code:` materialization — resolve it at runner startup,
not at bundle time.

## Source resolution per variant

### `inline`

Trivial — emit `(path, content-as-bytes)`. The `path` is bundle- internal and
MUST NOT escape with `..` or absolute roots. Reject paths containing null bytes.

### `local`

Read from the workspace filesystem:

- If `path` resolves to a single file, emit one tuple `(as ?? path, bytes)`.
- If `path` resolves to a directory, walk recursively. For each file, emit
  `(as/<rel> ?? <rel>, bytes)` where `<rel>` is the path relative to the
  directory.
- If `glob` is set, filter files matching the glob (POSIX glob syntax, not
  shell-extended).

The host is the only source of truth for what counts as a "file" inside the
workspace — for Supabase-backed filesystems, `readdir` returns logical paths.

Reject any `path` that escapes the workspace root after normalization.

### `github`

Authentication: the host MUST resolve the `github` connector configured for the
workspace and obtain a fetch token. Personal Access Tokens, OAuth tokens, and
GitHub App installation tokens are all acceptable. The token is short-lived; do
not log it.

Cache key: `(repo, resolvedSha, path)`.

Resolution policy:

| Ref shape (regex)      | Action                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `^[0-9a-f]{40}$`       | Use as-is (it IS the SHA). Cache forever.                                                                                                   |
| `^v[0-9]+(\.[0-9]+)*$` | Resolve via `GET /repos/{owner}/{repo}/git/refs/tags/{ref}` → SHA. Cache 24h, refetch after. Record the resolved SHA in connector metadata. |
| anything else (branch) | Resolve via `GET /repos/{owner}/{repo}/git/refs/heads/{ref}` → SHA. Refetch on every scan. Record SHA in connector metadata.                |

After resolving the SHA:

1. Fetch tarball: `GET /repos/{owner}/{repo}/tarball/{sha}` (auth header).
2. Extract in-memory or to a temp dir.
3. If `path` is set, narrow to that subdirectory.
4. Emit `(as/<rel> ?? <rel>, bytes)` per file in the (sub)tree.

Hosts MAY refuse non-SHA refs in production via a policy flag (e.g.
`AIP26_REQUIRE_PIN=true`). When the flag is set and a manifest declares
`ref: main`, registration MUST fail with a precise error.

### `ref`

Recursive resolution. Algorithm:

```
function resolveRef(refPath, visited):
  if refPath in visited: throw CycleError
  visited.add(refPath)

  manifest = readManifest(refPath + "/manifest.yaml")
  if manifest.kind != "code-workspace": throw KindError

  resolved = []
  for source in manifest.code.sources:
    if source has ref:
      resolved.extend(resolveRef(source.ref, visited))
    else:
      resolved.append(resolveSource(source))

  return resolved
```

A cycle in `ref:` chains MUST be detected at any depth. Hosts SHOULD also
enforce a maximum depth (e.g. 5) to bound resolution time.

The referenced manifest's `runner`, `secrets`, `network` blocks are INHERITED by
the referencing manifest — but only at the manifest level, not at the source
level. (See [Inheritance semantics](#inheritance-semantics).)

## Overlay merge

```
mergedMap = new Map()  # path → bytes
for source in sources_in_declaration_order:
  for (path, bytes) in resolveSource(source):
    mergedMap.set(path, bytes)   # OVERWRITES existing entry
```

Determinism: given the same inputs, the merged map MUST be byte-identical across
runs. SHA-pinned github refs are mandatory when the host wants reproducibility
guarantees.

After merge, the host produces a tar.gz buffer. The tar entry order SHOULD be
sorted (lexicographic by path) so the tarball itself is deterministic — useful
for content-addressed caching downstream.

## `run` resolution at startup

Three forms, three handlers:

### File path form

```yaml
run: tool.ts
```

The host extracts the extension, picks the runner, and execs:

| Extension             | Command                        |
| --------------------- | ------------------------------ |
| `.ts`, `.tsx`, `.mts` | `npx --yes tsx <bundle>/<run>` |
| `.js`, `.mjs`, `.cjs` | `node <bundle>/<run>`          |
| `.py`                 | `python <bundle>/<run>`        |
| `.sh`                 | `bash <bundle>/<run>`          |

Hosts MAY ship additional runners (Deno, Bun, Ruby) and SHOULD document their
extension mapping.

### Exec ARGV form

```yaml
run: ["python", "-m", "mytool"]
```

Pass the array verbatim to `execve(2)`. No shell. CWD = bundle root.

### Shell command form

```yaml
run: "npm run build && node dist/tool.js"
```

Detection heuristics (any one triggers shell form):

- Contains `&&`, `||`, `|`, `;`, `>`, `<`, backtick, `$(`, or `${`
- Contains an unquoted space and the prefix isn't a recognized
  extension+filename

Execute via `bash -c <string>`. CWD = bundle root.

### Explicit object form

When automatic detection is ambiguous, manifests SHOULD use the explicit form:

```yaml
run: { file: tool.ts }
run: { exec: ["python", "-m", "mytool"] }
run: { shell: "npm run build && node dist/tool.js" }
```

Hosts MUST honor the explicit discriminator regardless of the value's shape.

## Inheritance semantics

When a tool/workflow declares `code: <ref>` to a code-workspace, the following
blocks are inherited from the referenced workspace's manifest:

| Block                                           | Inheritance                                                                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------- |
| `runner`                                        | Inherited. Tool MAY override fields field-by-field; host merges.                  |
| `secrets`                                       | Inherited. Tool MAY add additional bindings. Conflicts: tool overrides workspace. |
| `network`                                       | Inherited. Tool MAY add to `network.egress`. Cannot narrow.                       |
| `code`                                          | NOT inherited at this layer — the bundle IS the workspace's code.                 |
| `run`                                           | NOT inherited — each tool sets its own entry.                                     |
| `inputs`/`outputs`/`inputsFiles`/`outputsFiles` | NOT inherited — code-workspaces don't declare them.                               |
| `requiredCapabilities`                          | NOT inherited — capability gating is per-tool.                                    |

Hosts MUST validate that the merged `runner` is internally consistent (e.g. tool
requesting `python` runner against a workspace with `language: node` is a
conflict — reject at registration).

## Cache invalidation triggers

A connector row's cached metadata is invalidated when ANY of:

1. The `code.sources` array changes (any source added, removed, or modified).
2. A `local:` source's referenced workspace files change (mtime).
3. A `github:` source's resolved SHA changes (for floating refs, on every scan).
4. A `ref:` source's referenced workspace's manifest or files change
   (recursively).

The scanner SHOULD record a content hash of the resolved bundle in connector
metadata so subsequent scans short-circuit when nothing changed.

## Error surface

Errors during materialization fall into three classes:

| Class                     | When                                            | Surface                                                          |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| `ManifestValidationError` | `code` block fails schema                       | Trust UI: "manifest invalid" + per-issue details                 |
| `SourceResolutionError`   | github fetch fails / local path missing / cycle | Trust UI: per-source error with the offending source declaration |
| `BundleSizeError`         | Resolved tarball exceeds host limit             | Trust UI: "bundle too large (X MB > Y MB limit)"                 |

All three MUST surface BEFORE the runner is provisioned — the host MUST NOT
cold-start a sandbox for a bundle that fails materialization.

## Security

- **Path traversal**: every workspace-relative path normalized; reject `..`
  after normalization.
- **Symlink escape**: `local:` source resolution MUST refuse symlinks that point
  outside the workspace.
- **Github auth scope**: connector PAT/OAuth token scope MUST be read-only and
  scoped to the minimum repo set.
- **Tag mutability**: tags can be force-pushed. Production hosts SHOULD enforce
  SHA-only refs.
- **Cycle exhaustion**: detect `ref:` cycles at any depth; max depth
  recommended.
- **Bundle size cap**: hard limit (e.g. 100 MiB) prevents DoS.
- **Inline content**: reject embedded null bytes; YAML literal block scalar
  (`|`) is the canonical form.

## Reference implementation pointers

For Guilde's host implementation:

- Mirror + recursive walk:
  `apps/guilde/api/src/services/workspace-tools/mirror.ts`
- Tarball production: `tarballMirror()` in the same file (shells out to system
  `tar`)
- Github fetch + cache: TODO (Phase 3 — uses the existing oauth GitHub
  connector)
- Connector wiring: `WorkspaceSandboxMcpSettings` in
  `packages/mcp/core/src/user/types.ts`
- Lifecycle integration: `setWorkspaceTarballLoader` in
  `packages/mcp/core/src/sandbox/lifecycle.ts`

## Conformance checklist

Before claiming AIP-26 conformance, a host MUST:

- [ ] Accept `code:` as string OR object form.
- [ ] Resolve all 4 source variants (`inline`, `local`, `github`, `ref`).
- [ ] Implement overlay merge (last wins).
- [ ] Detect `ref:` cycles.
- [ ] Honor cache invalidation per ref shape.
- [ ] Resolve `run:` in all 3 forms (path, exec, shell) plus explicit object
      form.
- [ ] Validate path traversal at every workspace-relative path.
- [ ] Enforce a bundle size cap.
- [ ] Surface materialization errors before runner provisioning.
- [ ] Inherit `runner`/`secrets`/`network` from referenced code-workspaces.
