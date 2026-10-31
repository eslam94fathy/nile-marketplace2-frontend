'use client';

import { formatDateTime } from '@nile/domain';
import { cn, PrivateImage } from '@nile/ui';
import type { TicketMessage } from '../api';
import { THREAD_COPY as COPY } from '../copy';

/**
 * One line of a support thread (spec 00 §12.7): own messages at the end with "You", the other side named as
 * the API gives it, system lines centred and muted, internal notes (admins only, AD-29) labelled on a warning
 * background. Bodies are plain text, never HTML.
 */
export function MessageItem({
  message,
  onImageExpired,
}: {
  readonly message: TicketMessage;
  readonly onImageExpired: () => void;
}) {
  const time = (
    <time dateTime={message.createdAt} className="text-xs text-muted-foreground">
      {formatDateTime(message.createdAt)}
    </time>
  );
  if (message.kind === 'system') {
    return (
      <div className="flex flex-col items-center gap-0.5 py-1 text-center text-sm text-muted-foreground">
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        {time}
      </div>
    );
  }
  const own = message.sender.isMe;
  const note = message.kind === 'internal_note';
  const sender = own ? COPY.you : message.sender.displayName;
  return (
    <div className={cn('flex flex-col gap-1', own ? 'items-end' : 'items-start')}>
      <p className="text-xs font-medium text-muted-foreground">
        {note ? COPY.internalNoteBy(sender) : sender}
      </p>
      <div
        className={cn(
          'max-w-[85%] space-y-2 rounded-lg px-3 py-2 text-sm',
          note
            ? 'border border-warning bg-warning-muted text-foreground'
            : own
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        {message.attachments.length === 0 ? null : (
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((image, index) => (
              <li key={image.id}>
                <PrivateImage
                  image={image}
                  alt={COPY.photoAlt(index + 1, message.attachments.length, sender)}
                  sizes="128px"
                  onExpired={onImageExpired}
                  className="size-32 rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      {time}
    </div>
  );
}
