import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  agentIntegrationManifestCompatibility,
  parseAgentIntegrationManifest,
  type AgentIntegrationCompatibility,
  type AssetProviderDiagnostic,
} from '@lpc-toolkit/core';
import { AUTHORING_CAPABILITIES } from './capabilities.js';
import { CLI_VERSION } from './package-info.js';
import { commandError, commandOk, type CliResponse } from './response.js';
import { flagString, type ParsedArgs } from './args.js';

export interface AgentIntegrationCheckData {
  readonly manifest: {
    readonly id: string;
    readonly version: string;
  };
  readonly cliVersion: string;
  readonly compatible: boolean;
  readonly missingRequiredCapabilities: readonly string[];
  readonly missingOptionalCapabilities: readonly string[];
  readonly optionalFallback: boolean;
  readonly refusal: AgentIntegrationCompatibility['refusal'];
}

function diagnosticIssues(
  diagnostics: readonly AssetProviderDiagnostic[],
): CliResponse<null> {
  return {
    ok: false,
    command: 'agent integration check',
    data: null,
    warnings: [],
    errors: diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
      path: diagnostic.path,
    })),
  };
}

function readManifest(
  cwd: string,
  manifestPath: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly response: CliResponse<null> } {
  let source: string;
  try {
    source = readFileSync(path.resolve(cwd, manifestPath), 'utf8');
  } catch {
    return {
      ok: false,
      response: commandError('agent integration check', {
        code: 'agent_integration_manifest_read_failed',
        message: 'Unable to read the Agent integration manifest.',
        path: '--manifest',
      }),
    };
  }

  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    return {
      ok: false,
      response: commandError('agent integration check', {
        code: 'agent_integration_manifest_invalid_json',
        message: 'The Agent integration manifest is not valid JSON.',
        path: '--manifest',
      }),
    };
  }
}

export function runAgentIntegrationCommand(
  parsed: ParsedArgs,
  cwd: string,
): CliResponse<AgentIntegrationCheckData> | CliResponse<null> {
  const manifestPath = flagString(parsed.flags, 'manifest');
  if (manifestPath === undefined) {
    return commandError('agent integration check', {
      code: 'missing_argument',
      message: '--manifest is required.',
      path: '--manifest',
    });
  }

  const source = readManifest(cwd, manifestPath);
  if (!source.ok) return source.response;

  const parsedManifest = parseAgentIntegrationManifest(source.value);
  if (!parsedManifest.ok) return diagnosticIssues(parsedManifest.diagnostics);

  const compatibility = agentIntegrationManifestCompatibility(parsedManifest.manifest, {
    cliVersion: CLI_VERSION,
    capabilities: AUTHORING_CAPABILITIES,
  });
  if (compatibility.refusal !== null) {
    const missing = compatibility.missingRequiredCapabilities;
    return commandError('agent integration check', {
      code: compatibility.refusal.code,
      message: missing.length > 0
        ? `${compatibility.refusal.message} Missing required capabilities: ${missing.join(', ')}.`
        : compatibility.refusal.message,
      path: compatibility.cliRangeCompatible
        ? '$.requiredCapabilities'
        : '$.cliRange',
    });
  }

  return commandOk('agent integration check', {
    manifest: {
      id: parsedManifest.manifest.id,
      version: parsedManifest.manifest.version,
    },
    cliVersion: CLI_VERSION,
    compatible: true,
    missingRequiredCapabilities: [...compatibility.missingRequiredCapabilities],
    missingOptionalCapabilities: [...compatibility.missingOptionalCapabilities],
    optionalFallback: compatibility.optionalFallback,
    refusal: null,
  });
}
