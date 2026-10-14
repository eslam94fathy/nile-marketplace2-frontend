import type { ReactNode } from 'react';
import { AgentShell } from '@/components/shell/agent-shell';

// Signed-in area of the app. Auth pages (phase d) live outside this group, without the shell.
export default function PortalLayout({ children }: { readonly children: ReactNode }) {
  return <AgentShell>{children}</AgentShell>;
}
