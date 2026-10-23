'use client';

import { useState } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { Button } from './button';

export interface LoadMoreProps {
  /** `meta.hasMore` of the last page; the button disappears when false. */
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
  /** Rows shown so far: when it grows, "More items loaded." is announced. */
  readonly loadedCount: number;
  readonly label?: string;
  readonly className?: string;
}

/**
 * The only pagination control (conventions §7): a "Load more" button under the list, no infinite scroll,
 * no counts or page numbers (cursor API without totals).
 */
export function LoadMore({
  hasMore,
  loading,
  onLoadMore,
  loadedCount,
  label = UI_COPY.loadMore,
  className,
}: LoadMoreProps) {
  const [previousCount, setPreviousCount] = useState(loadedCount);
  const [announcement, setAnnouncement] = useState('');
  // Adjusting state while rendering (React docs, "storing information from previous renders").
  if (loadedCount !== previousCount) {
    setPreviousCount(loadedCount);
    if (loadedCount > previousCount) setAnnouncement(UI_COPY.moreLoaded);
  }

  return (
    <div className={cn('flex justify-center py-4', className)}>
      <span role="status" className="sr-only">
        {announcement}
      </span>
      {hasMore ? (
        <Button variant="outline" loading={loading} onClick={onLoadMore}>
          {label}
        </Button>
      ) : null}
    </div>
  );
}
