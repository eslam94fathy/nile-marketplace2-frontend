'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import {
  ACCOUNT_TYPE_LABELS,
  AGENT_STATUS_LABELS,
  fields,
  formatDate,
  formatDateTime,
  formatMoney,
} from '@nile/domain';
import { applyServerErrors, errorMessage } from '@nile/query';
import {
  AGENT_STATUS_TONES,
  Button,
  buttonVariants,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormAlert,
  NotFoundScreen,
  PageHeader,
  Skeleton,
  StatusBadge,
  toast,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  adminGovernoratesQuery,
  agentKeys,
  agentQuery,
  useGovernorateName,
  type AdminAgent,
} from '@/features/lookups';
import { agentActiveShipmentsOptions, SHIPMENTS_COPY, ShipmentsTable } from '@/features/shipments';
import { agentPayoutPath, agentRemittancePath, agentShipmentsPath, ROUTES } from '@/lib/routes';
import {
  activateAgent,
  agentAccountsQuery,
  deactivateAgent,
  isAgentMissing,
  updateAgent,
  type FinanceAccount,
} from '../api';
import { AGENTS_COPY as COPY } from '../copy';
import {
  editAgentPatch,
  editAgentSchema,
  editAgentValues,
  hasEditChanges,
  type AgentFormValues,
} from '../schemas';
import { AgentProfileFields } from './agent-fields';
import { LoginStatus } from './login-status';

/** The in-page anchor of the active shipments, linked from the `AGENT_HAS_ACTIVE_SHIPMENTS` alert. */
export const ACTIVE_SHIPMENTS_ID = 'active-shipments';

const FIELD_MAP = {
  fullName: { field: 'fullName', message: fields.FIELD_MESSAGES.tooLong(100) },
  phone: { field: 'phone', message: fields.FIELD_MESSAGES.egPhone },
  homeGovernorateId: { field: 'homeGovernorateId', message: fields.FIELD_MESSAGES.required },
} as const;

/** Every answer is the agent: it replaces the detail; lists, names and pickers follow. */
function useAgentUpdates(agentId: string) {
  const queryClient = useQueryClient();
  const settle = (agent: AdminAgent) => {
    queryClient.setQueryData(agentKeys.detail(agent.id), agent);
    void queryClient.invalidateQueries({
      queryKey: agentKeys.all(),
      predicate: (query) => query.queryKey[2] !== 'detail',
    });
  };
  /** The agent changed meanwhile (`AGENT_INVALID_STATUS_TRANSITION`): refetch and say so. True when handled. */
  const handleStale = (error: unknown): boolean => {
    if (!isApiError(error, 'AGENT_INVALID_STATUS_TRANSITION') && !isApiError(error, 'AGENT_NOT_FOUND')) {
      return false;
    }
    void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agentId) });
    toast({ title: COPY.statusChanged, tone: 'destructive' });
    return true;
  };
  return { settle, handleStale };
}

/** AD-11 Agent: profile, status actions, edit, active shipments and balances. */
export function AgentDetail({ agentId }: { readonly agentId: string }) {
  const agent = useQuery(agentQuery(agentId));
  if (agent.isError) {
    if (isAgentMissing(agent.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.agents} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToAgents}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void agent.refetch()}
          correlationId={isApiError(agent.error) ? (agent.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (agent.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <AgentContent agent={agent.data} />;
}

function AgentContent({ agent }: { readonly agent: AdminAgent }) {
  const governorates = useGovernorateName();
  return (
    <div className="space-y-8">
      <PageHeader
        title={agent.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={agent.status} labels={AGENT_STATUS_LABELS} tones={AGENT_STATUS_TONES} />
            <LoginStatus value={agent.userStatus} />
          </span>
        }
      />
      <AgentActions agent={agent} />
      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="agent-details" title={COPY.detailsHeading}>
          <dl className="space-y-2 text-sm">
            <Row label={COPY.email}>{agent.email}</Row>
            <Row label={COPY.phone}>{agent.phone}</Row>
            <Row label={COPY.homeGovernorate}>{governorates.name(agent.homeGovernorateId)}</Row>
            <Row label={COPY.status}>{AGENT_STATUS_LABELS[agent.status]}</Row>
            <Row label={COPY.login}>
              <LoginStatus value={agent.userStatus} />
            </Row>
            <Row label={COPY.onShift}>{agent.onShift ? COPY.yes : COPY.no}</Row>
            <Row label={COPY.activeShipments}>{agent.activeShipmentCount}</Row>
            <Row label={COPY.lastAssigned}>
              {agent.lastAssignedAt === null ? COPY.never : formatDateTime(agent.lastAssignedAt)}
            </Row>
            <Row label={COPY.created}>{formatDate(agent.createdAt)}</Row>
          </dl>
          {agent.userStatus === 'invited' ? (
            <p className="text-sm text-muted-foreground">{COPY.invitePending}</p>
          ) : null}
        </Section>
        <EditAgent key={`${agent.fullName}|${agent.phone}|${agent.homeGovernorateId}`} agent={agent} />
      </div>
      <ActiveShipments agentId={agent.id} />
      <Balances agentId={agent.id} />
    </div>
  );
}

type Decision = 'activate' | 'deactivate';

/** Deactivate (`active`) or Activate (`inactive`), each confirmed. */
function AgentActions({ agent }: { readonly agent: AdminAgent }) {
  const [open, setOpen] = useState<Decision | null>(null);
  const [blocked, setBlocked] = useState(false);
  const queryClient = useQueryClient();
  const { settle, handleStale } = useAgentUpdates(agent.id);
  const decision: Decision = agent.status === 'active' ? 'deactivate' : 'activate';

  const run = async () => {
    setBlocked(false);
    try {
      if (decision === 'deactivate') {
        settle(await deactivateAgent(agent.id));
        toast({ title: COPY.deactivated(agent.fullName) });
      } else {
        settle(await activateAgent(agent.id));
        toast({ title: COPY.activated(agent.fullName), tone: 'success' });
      }
    } catch (error) {
      if (handleStale(error)) return;
      if (isApiError(error, 'AGENT_HAS_ACTIVE_SHIPMENTS')) {
        // The counts may have moved: read the agent and its shipments again.
        void queryClient.invalidateQueries({ queryKey: agentKeys.detail(agent.id) });
        void queryClient.invalidateQueries({ queryKey: agentActiveShipmentsOptions(agent.id).queryKey });
        setBlocked(true);
        return;
      }
      toast({ title: errorMessage(error), tone: 'destructive' });
      throw error;
    }
  };

  return (
    <section aria-labelledby="agent-actions-heading" className="space-y-3">
      <h2 id="agent-actions-heading" className="sr-only">
        {COPY.actionsHeading}
      </h2>
      <Button
        variant={decision === 'deactivate' ? 'destructive' : 'primary'}
        onClick={() => {
          setOpen(decision);
        }}
      >
        {decision === 'deactivate' ? COPY.deactivate : COPY.activate}
      </Button>
      {blocked ? (
        <FormAlert>
          {COPY.hasActiveShipments}{' '}
          <a href={`#${ACTIVE_SHIPMENTS_ID}`} className="font-medium underline underline-offset-4">
            {COPY.seeActiveShipments}
          </a>
        </FormAlert>
      ) : null}
      <ConfirmDialog
        open={open !== null}
        onOpenChange={(next) => {
          if (!next) setOpen(null);
        }}
        title={decision === 'deactivate' ? COPY.deactivateTitle : COPY.activateTitle}
        description={
          decision === 'deactivate'
            ? COPY.deactivateConfirm(agent.fullName)
            : COPY.activateConfirm(agent.fullName)
        }
        confirmLabel={decision === 'deactivate' ? COPY.deactivate : COPY.activate}
        destructive={decision === 'deactivate'}
        onConfirm={run}
      />
    </section>
  );
}

/** AD-11 Edit: full name, phone, home governorate; only changed fields are sent. */
function EditAgent({ agent }: { readonly agent: AdminAgent }) {
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const governorates = useQuery(adminGovernoratesQuery());
  const { settle, handleStale } = useAgentUpdates(agent.id);
  const form = useForm<AgentFormValues, unknown, z.output<typeof editAgentSchema>>({
    resolver: zodResolver(editAgentSchema),
    mode: 'onBlur',
    defaultValues: editAgentValues(agent),
  });
  const changed = hasEditChanges(useWatch({ control: form.control }) as AgentFormValues, agent);

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    const patch = editAgentPatch(values, agent);
    if (patch === null) return;
    try {
      settle(await updateAgent(agent.id, patch));
      toast({ title: COPY.saved, tone: 'success' });
    } catch (error) {
      if (handleStale(error)) return;
      if (isApiError(error, 'GOVERNORATE_NOT_FOUND')) {
        void governorates.refetch();
        form.setError('homeGovernorateId', { type: 'server', message: COPY.governorateGone });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <Section id="agent-edit" title={COPY.editHeading}>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-4">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <AgentProfileFields control={form.control} governorates={governorates} />
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || !changed || failure.blocked}
        >
          {COPY.save}
        </Button>
      </form>
    </Section>
  );
}

function ActiveShipments({ agentId }: { readonly agentId: string }) {
  const shipments = useInfiniteQuery(agentActiveShipmentsOptions(agentId));
  return (
    <section
      id={ACTIVE_SHIPMENTS_ID}
      aria-labelledby={`${ACTIVE_SHIPMENTS_ID}-heading`}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={`${ACTIVE_SHIPMENTS_ID}-heading`} className="text-lg font-semibold">
          {COPY.activeHeading}
        </h2>
        <Link
          href={agentShipmentsPath(agentId)}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          {COPY.allShipments}
        </Link>
      </div>
      {shipments.isError ? (
        <ErrorState
          message={COPY.activeFailed}
          onRetry={() => void shipments.refetch()}
          correlationId={
            isApiError(shipments.error) ? (shipments.error.correlationId ?? undefined) : undefined
          }
        />
      ) : (
        <ShipmentsTable
          caption={SHIPMENTS_COPY.activeCaption}
          query={shipments}
          empty={<EmptyState title={SHIPMENTS_COPY.activeEmpty} />}
        />
      )}
    </section>
  );
}

function Balances({ agentId }: { readonly agentId: string }) {
  const accounts = useQuery(agentAccountsQuery(agentId));
  const columns: readonly DataTableColumn<FinanceAccount>[] = [
    {
      id: 'account',
      header: COPY.balanceColumns.account,
      cell: (row) => ACCOUNT_TYPE_LABELS[row.accountType],
    },
    {
      id: 'balance',
      header: COPY.balanceColumns.balance,
      align: 'end',
      cell: (row) => formatMoney(row.balance),
    },
    { id: 'updated', header: COPY.balanceColumns.updated, cell: (row) => formatDateTime(row.updatedAt) },
  ];
  return (
    <Section id="agent-balances" title={COPY.balancesHeading}>
      <p className="text-sm text-muted-foreground">{COPY.balancesNote}</p>
      {accounts.isError ? (
        <ErrorState
          message={COPY.balancesFailed}
          onRetry={() => void accounts.refetch()}
          correlationId={isApiError(accounts.error) ? (accounts.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.balancesCaption}
          columns={columns}
          rows={accounts.data ?? []}
          getRowId={(row) => row.id}
          loading={accounts.isPending}
          empty={<p className="text-sm text-muted-foreground">{COPY.noBalances}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          href={agentRemittancePath(agentId)}
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          {COPY.recordCod}
        </Link>
        <Link href={agentPayoutPath(agentId)} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {COPY.recordPayout}
        </Link>
      </div>
    </Section>
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
