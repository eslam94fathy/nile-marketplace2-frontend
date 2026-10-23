import { fields } from '@nile/domain';
import { z } from 'zod';
import type { AdminAgent } from '@/features/lookups';
import type { CreateAgentBody, UpdateAgentBody } from './api';

// AD-10 and AD-11 forms, mirroring `CreateAgentDto` and `UpdateAgentDto` [VERIFIED].

const profileFields = {
  fullName: fields.trimmedString(1, 100),
  phone: fields.egPhone,
  homeGovernorateId: z.string().min(1, fields.FIELD_MESSAGES.required),
};

export const createAgentSchema = z.object({ email: fields.email, ...profileFields });
/** Both forms use these values (the edit form never renders or sends `email`). */
export type AgentFormValues = z.input<typeof createAgentSchema>;

export const EMPTY_AGENT: AgentFormValues = { email: '', fullName: '', phone: '', homeGovernorateId: '' };

export const createAgentBody = (values: z.output<typeof createAgentSchema>): CreateAgentBody => ({
  email: values.email,
  fullName: values.fullName,
  phone: values.phone,
  homeGovernorateId: values.homeGovernorateId,
});

/** The email is shown, never edited: it is carried in the values and ignored by the patch. */
export const editAgentSchema = z.object({ email: z.string(), ...profileFields });

/** The form's starting values: the agent as the API returned it (phone after the `+20` prefix). */
export const editAgentValues = (agent: AdminAgent): AgentFormValues => ({
  email: agent.email,
  fullName: agent.fullName,
  phone: fields.toLocalPhone(agent.phone),
  homeGovernorateId: agent.homeGovernorateId,
});

/** Only the fields that differ after normalisation; null when nothing changed (the API refuses `{}`). */
export function editAgentPatch(
  values: z.output<typeof editAgentSchema>,
  agent: AdminAgent,
): UpdateAgentBody | null {
  const patch: UpdateAgentBody = {
    ...(values.fullName === agent.fullName ? {} : { fullName: values.fullName }),
    ...(values.phone === agent.phone ? {} : { phone: values.phone }),
    ...(values.homeGovernorateId === agent.homeGovernorateId
      ? {}
      : { homeGovernorateId: values.homeGovernorateId }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

/** Whether Save has anything to send. A value that doesn't parse counts as a change, so its error shows. */
export function hasEditChanges(values: AgentFormValues, agent: AdminAgent): boolean {
  const parsed = editAgentSchema.safeParse(values);
  return !parsed.success || editAgentPatch(parsed.data, agent) !== null;
}
