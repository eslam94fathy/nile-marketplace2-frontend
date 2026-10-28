import type { CreateSocket, SocketLike, SocketOptions } from '../connection';

type Handler = (...args: unknown[]) => void;

/** A scriptable stand-in for a Socket.IO client socket: the test plays the server. */
export class FakeSocket implements SocketLike {
  active = false;
  connected = false;
  readonly url: string;
  readonly options: SocketOptions;
  /** Tokens handed to the handshake, one per `connect()`. */
  readonly tokens: (string | undefined)[] = [];
  readonly emitted: { event: string; payload: unknown }[] = [];
  connectCalls = 0;
  disconnectCalls = 0;
  /** What `emitWithAck` answers next (`undefined` → rejects as a timeout). */
  acks: unknown[] = [];
  private readonly handlers = new Map<string, Handler[]>();
  private readonly anyHandlers: ((event: string, ...args: unknown[]) => void)[] = [];

  constructor(url: string, options: SocketOptions) {
    this.url = url;
    this.options = options;
  }

  connect() {
    this.connectCalls += 1;
    this.active = true;
    this.options.auth((data) => {
      this.tokens.push(data.token);
    });
  }
  disconnect() {
    this.disconnectCalls += 1;
    const wasConnected = this.connected;
    this.active = false;
    this.connected = false;
    if (wasConnected) this.fire('disconnect', 'io client disconnect');
  }
  on(event: string, listener: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), listener]);
  }
  onAny(listener: (event: string, ...args: unknown[]) => void) {
    this.anyHandlers.push(listener);
  }
  emit(event: string, payload: unknown) {
    this.emitted.push({ event, payload });
  }
  timeout() {
    return {
      emitWithAck: (event: string, payload: unknown) => {
        this.emitted.push({ event, payload });
        const ack = this.acks.shift();
        return ack === undefined
          ? Promise.reject(new Error('operation has timed out'))
          : Promise.resolve(ack);
      },
    };
  }

  // Server side of the script.
  accept() {
    this.connected = true;
    this.fire('connect');
  }
  /** A middleware refusal: Socket.IO doesn't retry these by itself. */
  refuse(code: string) {
    this.active = false;
    this.fire('connect_error', Object.assign(new Error(code), { data: { code } }));
  }
  /** A transport failure: Socket.IO keeps retrying. */
  transportError() {
    this.fire('connect_error', new Error('websocket error'));
  }
  /** `session.ended` then the server's close. */
  end(reason: string) {
    this.message('session.ended', { reason }, 'gateway-1');
    this.active = false;
    this.connected = false;
    this.fire('disconnect', 'io server disconnect');
  }
  drop() {
    this.connected = false;
    this.fire('disconnect', 'transport close');
  }
  message(type: string, data: unknown, eventId = 'evt-1') {
    for (const listener of this.anyHandlers) {
      listener(type, { type, eventId, occurredAt: '2026-10-28T10:00:00.000Z', data });
    }
  }
  raw(event: string, payload: unknown) {
    for (const listener of this.anyHandlers) listener(event, payload);
  }

  private fire(event: string, ...args: unknown[]) {
    for (const listener of this.handlers.get(event) ?? []) listener(...args);
  }
}

/** `createSocket` for tests; `sockets` holds every socket made. */
export function fakeSockets() {
  const sockets: FakeSocket[] = [];
  const createSocket: CreateSocket = (url, options) => {
    const socket = new FakeSocket(url, options);
    sockets.push(socket);
    return socket;
  };
  const current = () => {
    const socket = sockets.at(-1);
    if (socket === undefined) throw new Error('no socket created');
    return socket;
  };
  return { sockets, createSocket, current };
}

/** Lets pending promise callbacks (token fetch, refresh) run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
