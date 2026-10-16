// Public interface of the agent's profile and status (spec 04 §2.2, AG-02, AG-03).
export { profileKeys, profileQuery, type AgentProfile } from './api';
export { PROFILE_COPY } from './copy';
export { InactiveBanner, InactiveGate } from './components/inactive';
export { MeView } from './components/me-view';
export { ShiftSwitch } from './components/shift-switch';
export { useInactiveHandler, useInactiveOnError } from './hooks';
