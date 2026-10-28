// The socket contract, mirrored by hand from the backend's `src/lib/realtime/messages.ts` at the pinned commit
// (backend docs/realtime.md, design 01 §15.1; not in the OpenAPI document, like the error codes, OA-3).
// Messages only notify: ids and statuses, never data to show. The client refetches over REST.

export const REALTIME_MESSAGE_TYPES = [
  'order.updated',
  'seller_order.placed',
  'seller_order.updated',
  'shipment.updated',
  'shipment.assigned',
  'shipment.unassigned',
  'payment.updated',
  'return.updated',
  'media.updated',
  'support.message_created',
  'support.ticket_updated',
  'support.typing',
  'notification.created',
  'session.ended',
] as const;
export type RealtimeMessageType = (typeof REALTIME_MESSAGE_TYPES)[number];

/** Why the server closes a socket (`session.ended`). */
export const REALTIME_DISCONNECT_REASONS = [
  'token_expired',
  'server_shutting_down',
  'account_suspended',
] as const;
export type RealtimeDisconnectReason = (typeof REALTIME_DISCONNECT_REASONS)[number];

/** `data` per message type. Statuses are the REST enum values, typed loosely as the backend does. */
export interface RealtimeMessageData {
  'order.updated': { orderId: string; orderNumber: string; status: string };
  'seller_order.placed': { sellerOrderId: string; orderNumber: string };
  'seller_order.updated': { sellerOrderId: string; orderId: string; status: string };
  'shipment.updated': {
    shipmentId: string;
    sellerOrderId: string;
    orderId: string;
    status: string;
    kind: string;
  };
  'shipment.assigned': { shipmentId: string; sellerOrderId: string };
  'shipment.unassigned': { shipmentId: string; sellerOrderId: string };
  'payment.updated': { orderId: string; paymentStatus: string };
  'return.updated': { returnId: string; sellerOrderId: string; orderId: string; status: string };
  'media.updated': { mediaId: string; status: string };
  'support.message_created': { ticketId: string; messageId: string };
  'support.ticket_updated': { ticketId: string; status: string; assignedAdminId: string | null };
  'support.typing': { ticketId: string; userId: string; role: string };
  'notification.created': {
    notificationId: string;
    category: string;
    title: string;
    body: string;
    link: string | null;
  };
  'session.ended': { reason: RealtimeDisconnectReason };
}

export interface RealtimeMessage<T extends RealtimeMessageType = RealtimeMessageType> {
  readonly type: T;
  /** The source domain event; one event may produce several messages, so dedupe on `eventId` + `type`. */
  readonly eventId: string;
  readonly occurredAt: string;
  readonly data: RealtimeMessageData[T];
}

const KNOWN_TYPES = new Set<string>(REALTIME_MESSAGE_TYPES);

export function isRealtimeMessageType(type: string): type is RealtimeMessageType {
  return KNOWN_TYPES.has(type);
}

/**
 * The envelope's shape, checked before anything acts on it. `data` is checked only for being an object: it
 * carries ids that are used as query-key parameters, never shown.
 */
export function isRealtimeMessage(value: unknown): value is RealtimeMessage {
  if (typeof value !== 'object' || value === null) return false;
  const { type, eventId, occurredAt, data } = value as Record<string, unknown>;
  return (
    typeof type === 'string' &&
    isRealtimeMessageType(type) &&
    typeof eventId === 'string' &&
    typeof occurredAt === 'string' &&
    typeof data === 'object' &&
    data !== null
  );
}

/** Signals the client sends (backend docs/realtime.md "Signals"). */
export const REALTIME_SIGNALS = {
  ticketSubscribe: 'ticket.subscribe',
  ticketUnsubscribe: 'ticket.unsubscribe',
  typing: 'support.typing',
} as const;

/** `connect_error.data.code` values the gateway sends. */
export const REALTIME_CONNECT_ERROR_CODES = [
  'ORIGIN_NOT_ALLOWED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;
export type RealtimeConnectErrorCode = (typeof REALTIME_CONNECT_ERROR_CODES)[number];
