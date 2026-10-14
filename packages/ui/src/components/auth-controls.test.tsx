// @vitest-environment jsdom
import { act, render, renderHook, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../test/axe';
import { useCooldown } from '../use-cooldown';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';
import { Label } from './label';
import { Notice } from './notice';
import { PasswordInput } from './password-input';
import { PhoneInput } from './phone-input';

describe('PasswordInput', () => {
  it('hides the value by default and toggles visibility with a pressed-state button', async () => {
    const { container } = render(
      <>
        <Label htmlFor="pw">Password</Label>
        <PasswordInput id="pw" defaultValue="  spaced  " />
      </>,
    );
    const input = screen.getByLabelText('Password');
    expect(input.getAttribute('type')).toBe('password');
    expect((input as HTMLInputElement).value).toBe('  spaced  ');
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(toggle);
    expect(input.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await expectNoAxeViolations(container);
  });
});

describe('PhoneInput', () => {
  it('announces the +20 prefix along with the field’s own description', async () => {
    const { container } = render(
      <>
        <Label htmlFor="phone">Mobile phone</Label>
        <PhoneInput id="phone" aria-describedby="hint" />
        <p id="hint">10 digits</p>
      </>,
    );
    const input = screen.getByLabelText('Mobile phone');
    expect(input.getAttribute('type')).toBe('tel');
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toContain('hint');
    const prefix = document.getElementById(ids[0] ?? '');
    expect(prefix?.textContent).toContain('Country code +20');
    await expectNoAxeViolations(container);
  });
});

describe('Notice', () => {
  it('is a polite status message', () => {
    render(<Notice tone="success">Your password was changed.</Notice>);
    expect(screen.getByRole('status').textContent).toBe('Your password was changed.');
  });
});

describe('DropdownMenu', () => {
  it('opens from its trigger, moves with arrow keys and selects with Enter', async () => {
    const selected: string[] = [];
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Account</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => selected.push('orders')}>Orders</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => selected.push('sign-out')}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(screen.getByRole('menu')).toBeDefined();
    // After a pointer open Radix focuses the menu itself; the first ArrowDown reaches the first item.
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(selected).toEqual(['sign-out']);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('useCooldown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts whole seconds down from a deadline and ends at 0', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCooldown());
    expect(result.current.remaining).toBe(0);
    act(() => {
      result.current.start(3);
    });
    expect(result.current.remaining).toBe(3);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current.remaining).toBe(2);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current.remaining).toBe(0);
    act(() => {
      result.current.start(60);
    });
    expect(result.current.remaining).toBe(60);
  });
});
