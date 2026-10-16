import { adminAgentFactory, fixtureId } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { editAgentPatch, editAgentSchema, editAgentValues, hasEditChanges } from '../schemas';
import { agentApiQuery, agentFiltersQuery, parseAgentFilters } from './list-params';

const GOVERNORATE = fixtureId(9700);

describe('agent filters (spec 03 AD-09)', () => {
  it('opens on Active, newest first', () => {
    const filters = parseAgentFilters({});
    expect(filters.status).toBe('active');
    expect(agentApiQuery(filters)).toEqual({ sort: '-createdAt', 'status[eq]': 'active' });
    expect(agentFiltersQuery(filters)).toBe('');
  });

  it('All, shift, governorate and name map to the literal API keys and round-trip', () => {
    const filters = parseAgentFilters({
      status: 'all',
      shift: 'off',
      governorate: GOVERNORATE,
      name: ' Sam ',
    });
    expect(agentApiQuery(filters)).toEqual({
      sort: '-createdAt',
      'onShift[eq]': false,
      'homeGovernorateId[eq]': GOVERNORATE,
      'fullName[like]': 'Sam',
    });
    expect(parseAgentFilters(Object.fromEntries(new URLSearchParams(agentFiltersQuery(filters))))).toEqual(
      filters,
    );
  });

  it('drops invalid values', () => {
    expect(parseAgentFilters({ status: 'gone', shift: 'maybe', governorate: 'x', name: '' })).toEqual({
      status: 'active',
      shift: null,
      governorateId: null,
      name: null,
    });
  });
});

describe('agent edit (spec 03 AD-11)', () => {
  const agent = adminAgentFactory({ fullName: 'Sam Nabil', phone: '+201012345678' });

  it('starts from the agent, phone after +20; nothing to send without a change', () => {
    const values = editAgentValues(agent);
    expect(values.phone).toBe('1012345678');
    expect(hasEditChanges(values, agent)).toBe(false);
    expect(editAgentPatch(editAgentSchema.parse(values), agent)).toBeNull();
  });

  it('sends only the changed fields, compared after normalisation', () => {
    const values = { ...editAgentValues(agent), fullName: ' Sam Nabil ', phone: '01112345678' };
    expect(editAgentPatch(editAgentSchema.parse(values), agent)).toEqual({ phone: '+201112345678' });
  });

  it('an invalid value counts as a change (so its error shows)', () => {
    expect(hasEditChanges({ ...editAgentValues(agent), phone: '123' }, agent)).toBe(true);
  });
});
