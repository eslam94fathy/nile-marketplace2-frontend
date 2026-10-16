// Public interface of the shared admin lookups (spec 03 §2.2): governorate names, history actors, agents.
export { adminDirectoryQuery, adminGovernoratesQuery, lookupKeys } from './api';
export {
  agentKeys,
  agentPickerQuery,
  agentQuery,
  assignableAgentsOptions,
  useAgentNames,
  type AdminAgent,
} from './agents';
export { useActorLabel, useGovernorateName, YOU } from './hooks';
export { useSellerNames } from './sellers';
