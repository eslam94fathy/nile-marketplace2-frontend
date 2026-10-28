// Public interface of @nile/realtime (design 01 §15.1, §15.3): client only, React, no Next.js. The only package
// that may import socket.io-client.
export {
  ACK_TIMEOUT_MS,
  createRealtimeConnection,
  DEDUPE_SIZE,
  MAX_AUTH_REFUSALS,
  RECONNECT_DELAY_MAX_MS,
  RECONNECT_DELAY_MS,
  SHUTDOWN_RECONNECT_MAX_MS,
  type CreateSocket,
  type RealtimeConnection,
  type RealtimeConnectionOptions,
  type RealtimeStatus,
  type RefreshOutcome,
  type SocketLike,
  type SocketOptions,
} from './connection';
export {
  HIDDEN_CLOSE_MS,
  REFETCH_DEBOUNCE_MS,
  RealtimeProvider,
  useRealtimeConnected,
  useRealtimeMessage,
  useRealtimeStatus,
  type InvalidationMap,
  type RealtimeProviderProps,
} from './provider';
export {
  TICKET_SUBSCRIBE_RETRIES,
  TICKET_SUBSCRIBE_RETRY_MS,
  TYPING_THROTTLE_MS,
  useTicketRoom,
  useTypingSignal,
  type TicketRoomOptions,
} from './signals';
