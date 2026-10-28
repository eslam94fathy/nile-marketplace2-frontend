// @vitest-environment jsdom
import { SELLER_ORDER_STATUS_LABELS } from '@nile/domain';
import { act, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SELLER_ORDER_STATUS_TONES } from '../status-tones';
import { expectNoAxeViolations } from '../test/axe';
import { Badge, StatusBadge } from './badge';
import { Button } from './button';
import { Countdown } from './countdown';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from './dialog';
import { DateTime, Money } from './formatted';
import { LoadMore } from './load-more';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from './states';
import { dismissToast, toast, Toaster } from './toast';

describe('Dialog', () => {
  it('moves focus in, closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger asChild>
          <Button>Edit address</Button>
        </DialogTrigger>
        <DialogContent title="Edit address" description="Changes apply to new orders only.">
          <input aria-label="Street" />
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Edit address' });
    await user.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Edit address' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(screen.getByText('Changes apply to new orders only.')).toBeDefined();
    await expectNoAxeViolations();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('opened from state (no trigger), it returns focus to the control that opened it', async () => {
    const user = userEvent.setup();
    function FromState() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button
            onClick={() => {
              setOpen(true);
            }}
          >
            Go off shift
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent title="Go off shift?">
              <input aria-label="Note" />
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<FromState />);
    const opener = screen.getByRole('button', { name: 'Go off shift' });
    await user.click(opener);
    expect(screen.getByRole('dialog', { name: 'Go off shift?' })).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

function Confirming({ onConfirm }: { readonly onConfirm: () => Promise<void> }) {
  const [open, setOpen] = useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Cancel the whole order?"
      description="The customer will be informed and the stock released."
      confirmLabel="Cancel order"
      cancelLabel="Keep order"
      destructive
      onConfirm={onConfirm}
    />
  );
}

describe('ConfirmDialog', () => {
  it('shows progress, then closes when the action succeeds', async () => {
    let finish: () => void = () => undefined;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<Confirming onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(screen.getByRole('button', { name: 'Cancel order' }).getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Keep order' })).toHaveProperty('disabled', true);
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('stays open when the action fails, so the caller can show the error', async () => {
    render(<Confirming onConfirm={() => Promise.reject(new Error('SELLER_ORDER_NOT_CANCELLABLE'))} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel order' }).getAttribute('aria-busy')).toBeNull();
    });
    expect(screen.getByRole('dialog', { name: 'Cancel the whole order?' })).toBeDefined();
  });
});

describe('Toast', () => {
  it('shows a toast with its reference and dismisses it', async () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Something went wrong. Please try again.', tone: 'destructive', correlationId: 'c-42' });
    });
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeDefined();
    expect(screen.getByText('Reference: c-42')).toBeDefined();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByText('Reference: c-42')).toBeNull();
    });
  });

  it('dismisses by id and keeps at most three', async () => {
    render(<Toaster />);
    let first = 0;
    act(() => {
      first = toast({ title: 'One' });
      for (const title of ['Two', 'Three', 'Four']) toast({ title });
    });
    expect(screen.queryByText('One')).toBeNull();
    expect(await screen.findByText('Four')).toBeDefined();
    act(() => {
      dismissToast(first);
    });
    expect(screen.getByText('Two')).toBeDefined();
  });
});

describe('badges and formatted values', () => {
  it('StatusBadge shows the view label with the enum tone', () => {
    render(
      <StatusBadge
        value="placed"
        labels={SELLER_ORDER_STATUS_LABELS.seller}
        tones={SELLER_ORDER_STATUS_TONES}
      />,
    );
    const badge = screen.getByText('New — confirm');
    expect(badge.className).toContain('bg-warning-muted');
  });

  it('Badge defaults to neutral', () => {
    render(<Badge>Default</Badge>);
    expect(screen.getByText('Default').className).toContain('bg-secondary');
  });

  it('Money formats strings exactly, single or range', () => {
    render(
      <>
        <Money value="1250" />
        <Money value="51.00" max="71.00" />
      </>,
    );
    expect(screen.getByText(/1,250\.00/).textContent.replace(/\s/g, ' ')).toBe('EGP 1,250.00');
    expect(screen.getByText(/51\.00/).textContent.replace(/\s/g, ' ')).toBe('EGP 51.00 – EGP 71.00');
  });

  it('DateTime renders a machine-readable <time> in Cairo time', () => {
    render(<DateTime value="2026-10-14T07:30:00.000Z" />);
    const time = screen.getByText('14 Oct 2026, 10:30');
    expect(time.tagName).toBe('TIME');
    expect(time.getAttribute('datetime')).toBe('2026-10-14T07:30:00.000Z');
  });
});

describe('Countdown', () => {
  it('ticks every second and calls onExpire once at zero', () => {
    vi.useFakeTimers();
    try {
      let nowMs = Date.parse('2026-10-14T11:59:58.000Z');
      const onExpire = vi.fn();
      render(
        <Countdown
          deadline="2026-10-14T12:00:00.000Z"
          label="Time left to pay"
          onExpire={onExpire}
          now={() => nowMs}
        />,
      );
      const timer = screen.getByRole('timer');
      expect(timer.textContent).toBe('00:02');
      expect(timer.getAttribute('aria-label')).toBe('Time left to pay: 00:02');
      act(() => {
        nowMs += 2_000;
        vi.advanceTimersByTime(1_000);
      });
      expect(timer.textContent).toBe('00:00');
      act(() => {
        nowMs += 5_000;
        vi.advanceTimersByTime(5_000);
      });
      expect(onExpire).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('states', () => {
  it('EmptyState names what is empty and offers the next action', async () => {
    render(
      <EmptyState
        title="Your cart is empty."
        action={<Button variant="outline">Browse categories</Button>}
      />,
    );
    expect(screen.getByText('Your cart is empty.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Browse categories' })).toBeDefined();
    await expectNoAxeViolations();
  });

  it('ErrorState announces, retries and shows the reference', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} correlationId="c-7" />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Something went wrong. Please try again.');
    expect(alert.textContent).toContain('Reference: c-7');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('LoadingRegion gives skeletons one accessible "Loading…"', () => {
    render(
      <LoadingRegion>
        <Skeleton className="h-4" />
      </LoadingRegion>,
    );
    expect(screen.getByRole('status').textContent).toBe('Loading…');
  });

  it('LoadMore announces new rows and hides itself on the last page', () => {
    const { rerender } = render(<LoadMore hasMore loading={false} onLoadMore={vi.fn()} loadedCount={20} />);
    expect(screen.getByRole('status').textContent).toBe('');
    rerender(<LoadMore hasMore={false} loading={false} onLoadMore={vi.fn()} loadedCount={40} />);
    expect(screen.getByRole('status').textContent).toBe('More items loaded.');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });
});
