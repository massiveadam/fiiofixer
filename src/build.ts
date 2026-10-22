declare const __BUILD_ID__: string;
declare const __APP_VERSION__: string;

export const APP_VERSION = __APP_VERSION__;
export const BUILD_ID = __BUILD_ID__;

export interface RemoteBuild { id: string; version: string }

export function parseRemoteBuild(value: unknown): RemoteBuild | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.buildId !== 'string' || record.buildId === '') return null;
  if (typeof record.version !== 'string' || record.version === '') return null;
  return { id: record.buildId, version: record.version };
}

export function isNewerBuild(remote: RemoteBuild, current: string): boolean {
  return remote.id !== current;
}
