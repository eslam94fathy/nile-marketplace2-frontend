// Public interface of @nile/support-screens (design 01 §15.1, R-56): support tickets shared by the storefront,
// seller and admin apps. Each app wraps its support pages in <SupportScreensProvider> with its client, routes
// and Link. The tab helpers live outside the client screens, so server pages can read the URL.
export {
  ATTACHMENTS_MAX,
  MESSAGE_MAX,
  MESSAGES_POLL_MS,
  SUPPORT_TAB_STATUSES,
  supportInvalidation,
  supportKeys,
  type SupportTab,
  type Ticket,
  type TicketMessage,
} from './api';
export {
  SupportScreensProvider,
  useSupportConfig,
  type OrderChoice,
  type SupportLinkProps,
  type SupportScreensConfig,
} from './config';
export { NEW_TICKET_COPY, THREAD_COPY, TICKET_LIST_COPY } from './copy';
export { parseSupportTab, SUPPORT_TAB_PARAM, SUPPORT_TABS } from './tabs';
export { NewTicketForm, type NewTicketFormProps } from './components/new-ticket-form';
export { TicketList } from './components/ticket-list';
export { TicketThread, TYPING_VISIBLE_MS } from './components/ticket-thread';
