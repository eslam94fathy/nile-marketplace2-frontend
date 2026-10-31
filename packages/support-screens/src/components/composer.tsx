'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import { useIdempotentMutation, type Page } from '@nile/query';
import { useTypingSignal } from '@nile/realtime';
import { Button, Field, FormAlert, Textarea, UI_COPY } from '@nile/ui';
import type { InfiniteData } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { useForm } from 'react-hook-form';
import {
  postMessage,
  supportKeys,
  type AdminPostMessageBody,
  type PostMessageBody,
  type TicketMessage,
} from '../api';
import { useSupportConfig } from '../config';
import { THREAD_COPY as COPY } from '../copy';
import { messageSchema, postMessageBody, type MessageValues } from '../schemas';
import { markNotAttachable, PhotoPicker, useSupportUploads } from './photo-picker';

/** The newest page holds the newest messages (newest first); a sent message joins it once. */
function withMessage(
  data: InfiniteData<Page<TicketMessage>, string | undefined> | undefined,
  message: TicketMessage,
) {
  if (data === undefined) return data;
  if (data.pages.some((page) => page.data.some((existing) => existing.id === message.id))) return data;
  const [first, ...rest] = data.pages;
  if (first === undefined) return data;
  return { ...data, pages: [{ ...first, data: [message, ...first.data] }, ...rest] };
}

export interface ComposerProps {
  readonly ticketId: string;
  /** The ticket changed under the composer (closed, gone): read it again. */
  readonly onStale: () => void;
  /** After a sent message, so the thread scrolls to it. */
  readonly onSent: () => void;
  /**
   * Admin console only (AD-29, AD-Q-13): the message is an internal note (`internal: true`), never seen by the
   * user, so no typing signal is sent while writing it.
   */
  readonly internal?: boolean;
  /** Overrides for the admin console's two tabs; the user screens keep the defaults. */
  readonly labels?: { readonly field?: string; readonly hint?: string; readonly submit?: string };
}

/**
 * Reply box (spec 00 §12.7): text 1..4000 and up to 3 photos; Enter adds a line, Ctrl+Enter / ⌘+Enter sends.
 * One idempotency key per message intent; a failed send keeps the text and offers "Retry".
 */
export function Composer({ ticketId, onStale, onSent, internal = false, labels = {} }: ComposerProps) {
  const { api, scope, audience = 'user' } = useSupportConfig();
  const queryClient = useQueryClient();
  const { uploads, cooldownSeconds } = useSupportUploads();
  const notifyTyping = useTypingSignal(ticketId);
  const [failed, setFailed] = useState<{
    body: PostMessageBody | AdminPostMessageBody;
    correlationId?: string;
  } | null>(null);
  const form = useForm<MessageValues>({ resolver: zodResolver(messageSchema), defaultValues: { body: '' } });

  const send = useIdempotentMutation<TicketMessage, PostMessageBody | AdminPostMessageBody>({
    mutationFn: (body, key) => postMessage(api, ticketId, body, key, audience),
    onSuccess: async (message) => {
      setFailed(null);
      form.reset({ body: '' });
      uploads.clear();
      const keys = supportKeys(scope);
      queryClient.setQueryData(keys.messages(ticketId), (data: Parameters<typeof withMessage>[0]) =>
        withMessage(data, message),
      );
      onSent();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.detail(ticketId) }),
        queryClient.invalidateQueries({ queryKey: keys.lists() }),
      ]);
    },
  });

  const deliver = (body: PostMessageBody | AdminPostMessageBody) => {
    setFailed(null);
    send.mutate(body, {
      onError: (error) => {
        if (markNotAttachable(uploads, error)) return;
        if (isApiError(error, 'SUPPORT_TICKET_CLOSED', 'SUPPORT_TICKET_NOT_FOUND')) {
          onStale();
          return;
        }
        setFailed({
          body,
          ...(isApiError(error) && error.correlationId !== null
            ? { correlationId: error.correlationId }
            : {}),
        });
      },
    });
  };

  const submit = form.handleSubmit((values) => {
    const body = postMessageBody(values.body.trim(), uploads.readyMediaIds);
    // Strict bodies (CLAUDE.md §3): `internal` is sent only for a note.
    deliver(internal ? { ...body, internal: true } : body);
  });

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (!busy) void submit();
    }
  };

  const busy = uploads.busy || send.isPending;
  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="space-y-3">
      {failed === null ? null : (
        <FormAlert correlationId={failed.correlationId}>
          <span className="flex flex-wrap items-center gap-3">
            {COPY.sendFailed}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={send.isPending}
              onClick={() => {
                deliver(failed.body);
              }}
            >
              {COPY.retry}
            </Button>
          </span>
        </FormAlert>
      )}
      <Field
        control={form.control}
        name="body"
        label={labels.field ?? COPY.messageLabel}
        description={labels.hint ?? COPY.sendHint}
        required
        render={({ field, controlProps }) => (
          <Textarea
            {...field}
            {...controlProps}
            rows={3}
            onKeyDown={onKeyDown}
            onChange={(event) => {
              field.onChange(event);
              if (!internal) notifyTyping();
            }}
          />
        )}
      />
      <PhotoPicker label={UI_COPY.addPhotos} uploads={uploads} cooldownSeconds={cooldownSeconds} />
      {uploads.busy ? <p className="text-sm text-muted-foreground">{UI_COPY.waitForUploads}</p> : null}
      <Button type="submit" disabled={busy}>
        {labels.submit ?? COPY.send}
      </Button>
    </form>
  );
}
