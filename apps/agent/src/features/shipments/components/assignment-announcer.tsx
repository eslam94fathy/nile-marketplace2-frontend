'use client';

import { useRealtimeMessage } from '@nile/realtime';
import { useState } from 'react';
import { SHIPMENTS_COPY as COPY } from '../copy';

/** A trailing no-break space on every other message, so a screen reader announces the same sentence again. */
const REPEAT_MARK = ' ';

/**
 * AG-04 live announcements (spec 04 §7.3, T-N2): the lists refresh through the invalidation map; this says
 * politely what changed. Only while the socket brings messages; without one, the 30 s polling shows new cards
 * silently.
 */
export function AssignmentAnnouncer() {
  const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
  const announce = (text: string) => {
    setAnnouncement((current) => ({ text, count: current.count + 1 }));
  };
  useRealtimeMessage('shipment.assigned', () => {
    announce(COPY.assignedAnnouncement);
  });
  useRealtimeMessage('shipment.unassigned', () => {
    announce(COPY.unassignedAnnouncement);
  });
  return (
    <p aria-live="polite" className="sr-only">
      {announcement.text}
      {announcement.count % 2 === 0 ? '' : REPEAT_MARK}
    </p>
  );
}
