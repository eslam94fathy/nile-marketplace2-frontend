// Reads the backend's emails from Mailpit (design 01 §12.3): verification and reset codes, invite links.
// Each wait starts from the messages that existed *before* the triggering request, so a code from an
// earlier run for the same address is never picked up.

const POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 15_000;

/** Subjects of the backend templates (backend `src/app/notifications/templates`). */
export const EMAIL_SUBJECTS = {
  verification: 'Your Nile verification code',
  passwordReset: 'Reset your Nile password',
  invite: "You're invited to Nile",
} as const;

export type EmailKind = keyof typeof EMAIL_SUBJECTS;

const OTP_IN_TEXT = /^\s*(\d{6})\s*$/m;
/** Backend `INVITE_TOKEN_QUERY_PARAM`. */
const INVITE_TOKEN_PARAM = 'token';

interface MessageSummary {
  readonly ID: string;
  readonly Subject: string;
}

interface SearchResult {
  readonly messages: readonly MessageSummary[];
}

interface MessageDetail {
  readonly Text: string;
}

export interface Mailpit {
  /** Runs `trigger`, then waits for a new email of `kind` to `to` and returns its plain text. */
  awaitEmail(to: string, kind: EmailKind, trigger: () => Promise<unknown>): Promise<string>;
  /** Plain text of the newest email of `kind` already sent to `to`, if any. */
  latestEmail(to: string, kind: EmailKind): Promise<string | undefined>;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function createMailpit(baseUrl: string, timeoutMs = DEFAULT_TIMEOUT_MS): Mailpit {
  async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(new URL(path, baseUrl));
    if (!response.ok) throw new Error(`Mailpit ${path} → ${response.status}`);
    return (await response.json()) as T;
  }

  async function messagesTo(to: string, kind: EmailKind): Promise<MessageSummary[]> {
    const query = encodeURIComponent(`to:"${to}"`);
    const { messages } = await getJson<SearchResult>(`/api/v1/search?query=${query}`);
    // Matched in code: the subject contains an apostrophe the search syntax would need escaping for.
    return messages.filter((message) => message.Subject === EMAIL_SUBJECTS[kind]);
  }

  const textOf = async (message: MessageSummary): Promise<string> =>
    (await getJson<MessageDetail>(`/api/v1/message/${message.ID}`)).Text;

  return {
    async awaitEmail(to, kind, trigger) {
      const before = new Set((await messagesTo(to, kind)).map((message) => message.ID));
      await trigger();
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const fresh = (await messagesTo(to, kind)).find((message) => !before.has(message.ID));
        if (fresh) return textOf(fresh);
        await sleep(POLL_INTERVAL_MS);
      }
      throw new Error(`No new "${kind}" email within ${timeoutMs} ms (is the backend worker running?)`);
    },
    async latestEmail(to, kind) {
      // Mailpit lists the newest message first.
      const [newest] = await messagesTo(to, kind);
      return newest === undefined ? undefined : textOf(newest);
    },
  };
}

/** The 6-digit code of a verification or reset email (it sits on its own line). */
export function otpFromEmail(text: string): string {
  const match = OTP_IN_TEXT.exec(text);
  if (!match?.[1]) throw new Error('No 6-digit code in the email');
  return match[1];
}

/** The invite token from the link in an invite email. */
export function inviteTokenFromEmail(text: string): string {
  for (const word of text.split(/\s+/)) {
    if (!word.startsWith('http')) continue;
    const token = new URL(word).searchParams.get(INVITE_TOKEN_PARAM);
    if (token) return token;
  }
  throw new Error('No invite link in the email');
}
