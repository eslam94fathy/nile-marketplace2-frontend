import type { UserWorkspaceConfig } from 'vitest/config';

export declare function createVitestProject(
  name: string,
  options?: { include?: string[]; setupFiles?: string[]; alias?: Record<string, string> },
): UserWorkspaceConfig;
