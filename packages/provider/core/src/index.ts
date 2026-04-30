/**
 * @agentproto/provider — AIP-30 PROVIDER.md `defineProvider`
 * reference implementation + 6-phase resolver + per-call dispatch.
 *
 * Spec: https://agentproto.sh/docs/aip-30
 */

export const SPEC_NAME = "agentprovider/v1" as const
export const SPEC_VERSION = "1.0.0-alpha" as const

export { defineProvider, normalizeToolId } from "./define-provider.js"
export { implementTool } from "./implement-tool.js"
export { resolveProvider } from "./resolver.js"
export { runTool, applyMapping } from "./run-tool.js"

export type {
  ToolImplementation,
  TypedExecuteFn,
} from "./implement-tool.js"

export type {
  ProviderDefinition,
  ProviderHandle,
  ImplementsEntry,
  MappingValue,
  ExecuteFn,
  ExecuteArgs,
  ProviderContext,
  AuthConfig,
  AuthLoginConfig,
  AuthRefreshConfig,
  InstallMethod,
  VersionCheck,
  CostOverride,
  RetryPolicy,
  HealthCheckConfig,
  LoginArgs,
  LoginResult,
  RefreshArgs,
  RefreshResult,
  ParseOutputArgs,
  ParseOutputResult,
  DetectExpiryArgs,
  ResolverInput,
  ResolverContext,
  ResolverResult,
} from "./types.js"

export type { ProviderAvailability } from "./resolver.js"
