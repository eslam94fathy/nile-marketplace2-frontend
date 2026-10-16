'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { applyServerErrors } from '@nile/query';
import { Button, Field, FormAlert, Input, PageHeader, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { adminGovernoratesQuery, agentKeys } from '@/features/lookups';
import { agentPath, ROUTES } from '@/lib/routes';
import { createAgent } from '../api';
import { AGENTS_COPY as COPY } from '../copy';
import { createAgentBody, createAgentSchema, EMPTY_AGENT, type AgentFormValues } from '../schemas';
import { AgentProfileFields } from './agent-fields';

const FIELD_MAP = {
  email: { field: 'email', message: fields.FIELD_MESSAGES.email },
  fullName: { field: 'fullName', message: fields.FIELD_MESSAGES.tooLong(100) },
  phone: { field: 'phone', message: fields.FIELD_MESSAGES.egPhone },
  homeGovernorateId: { field: 'homeGovernorateId', message: fields.FIELD_MESSAGES.required },
} as const;

/** AD-10 New agent: creates the agent and sends the invitation, then opens AD-11. */
export function NewAgent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const governorates = useQuery(adminGovernoratesQuery());
  const form = useForm<AgentFormValues, unknown, z.output<typeof createAgentSchema>>({
    resolver: zodResolver(createAgentSchema),
    mode: 'onBlur',
    defaultValues: EMPTY_AGENT,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      const agent = await createAgent(createAgentBody(values));
      queryClient.setQueryData(agentKeys.detail(agent.id), agent);
      void queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: agentKeys.picker() });
      toast({ title: COPY.invited(agent.email), tone: 'success' });
      router.push(agentPath(agent.id));
    } catch (error) {
      if (isApiError(error, 'EMAIL_ALREADY_REGISTERED')) {
        form.setError('email', { type: 'server', message: COPY.emailTaken });
        return;
      }
      if (isApiError(error, 'GOVERNORATE_NOT_FOUND')) {
        void governorates.refetch();
        form.setError('homeGovernorateId', { type: 'server', message: COPY.governorateGone });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.newTitle}
        actions={
          <Link href={ROUTES.agents} className="text-sm text-primary underline-offset-4 hover:underline">
            {COPY.backToAgents}
          </Link>
        }
      />
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-xl space-y-4">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="email"
          label={COPY.email}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} type="email" autoComplete="off" />
          )}
        />
        <AgentProfileFields control={form.control} governorates={governorates} />
        <Button type="submit" loading={form.formState.isSubmitting} disabled={!hydrated || failure.blocked}>
          {COPY.create}
        </Button>
      </form>
    </div>
  );
}
