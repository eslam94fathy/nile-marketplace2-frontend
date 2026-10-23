// @vitest-environment jsdom
import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { expectNoAxeViolations } from '../test/axe';
import { Button } from './button';
import { Checkbox, Switch } from './checkbox';
import { Field, FormAlert } from './field';
import { Input, Textarea } from './input';
import { Select } from './select';

describe('Button', () => {
  it('is a non-submitting button by default and reacts to clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button.getAttribute('type')).toBe('button');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('while loading: disabled, busy, label still announced', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a link with button styling via asChild', () => {
    render(
      <Button asChild variant="outline">
        <a href="/cart">View cart</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'View cart' }).className).toContain('border-input');
  });
});

const schema = z.object({
  email: z.email('Enter a valid email address.'),
  note: z.string().max(5, 'Must be at most 5 characters.'),
  reason: z.enum(['out_of_stock', 'other'], { message: 'Choose a reason.' }),
  agree: z.literal(true, { message: 'You must agree.' }),
});
type FormValues = z.input<typeof schema>;

function TestForm({ onSubmit }: { readonly onSubmit: (values: FormValues) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', note: '', agree: false as unknown as true },
  });
  return (
    <form noValidate onSubmit={(event) => void form.handleSubmit(onSubmit)(event)}>
      <Field
        control={form.control}
        name="email"
        label="Email"
        description="We send your receipts here."
        required
        render={({ field, controlProps }) => <Input type="email" {...field} {...controlProps} />}
      />
      <Field
        control={form.control}
        name="note"
        label="Note"
        render={({ field, controlProps }) => <Textarea {...field} {...controlProps} />}
      />
      <Field
        control={form.control}
        name="reason"
        label="Reason"
        required
        render={({ field, controlProps }) => (
          <Select
            {...controlProps}
            value={field.value}
            onValueChange={field.onChange}
            placeholder="Choose…"
            options={[
              { value: 'out_of_stock', label: 'Out of stock' },
              { value: 'other', label: 'Other' },
            ]}
          />
        )}
      />
      <Field
        control={form.control}
        name="agree"
        label="I agree"
        layout="inline"
        render={({ field, controlProps }) => (
          <Checkbox
            {...controlProps}
            checked={field.value}
            onCheckedChange={(checked) => {
              field.onChange(checked === true);
            }}
          />
        )}
      />
      <Button type="submit">Send</Button>
    </form>
  );
}

describe('Field (React Hook Form + Zod)', () => {
  it('labels controls and links description and required state', () => {
    render(<TestForm onSubmit={vi.fn()} />);
    const email = screen.getByRole('textbox', { name: /Email/ });
    expect(email.getAttribute('aria-required')).toBe('true');
    expect(email.getAttribute('aria-invalid')).toBe('false');
    const describedBy = email.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(describedBy)?.textContent).toBe('We send your receipts here.');
  });

  it('shows each rule message under its field, linked and marked invalid', async () => {
    const onSubmit = vi.fn();
    render(<TestForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole('textbox', { name: /Note/ }), 'too long');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    const email = screen.getByRole('textbox', { name: /Email/ });
    expect(email.getAttribute('aria-invalid')).toBe('true');
    const ids = (email.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids.map((id) => document.getElementById(id)?.textContent)).toContain(
      'Enter a valid email address.',
    );
    expect(screen.getByText('Must be at most 5 characters.')).toBeDefined();
    expect(screen.getByText('Choose a reason.')).toBeDefined();
    expect(screen.getByText('You must agree.')).toBeDefined();
    expect(onSubmit).not.toHaveBeenCalled();
    await expectNoAxeViolations();
  });

  it('submits valid values chosen with the keyboard', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<TestForm onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'a@example.test');
    // Select: focus, open with the keyboard, pick the second option.
    screen.getByRole('combobox', { name: /Reason/ }).focus();
    await user.keyboard('{Enter}');
    await user.click(await screen.findByRole('option', { name: 'Other' }));
    await user.click(screen.getByRole('checkbox', { name: 'I agree' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledWith(
      { email: 'a@example.test', note: '', reason: 'other', agree: true },
      expect.anything(),
    );
  });
});

describe('FormAlert and Switch', () => {
  it('announces form-level errors with the reference', () => {
    render(<FormAlert correlationId="c-1">Some fields need attention.</FormAlert>);
    expect(screen.getByRole('alert').textContent).toContain('Reference: c-1');
  });

  it('switch toggles with the keyboard and is labelled', async () => {
    const onChange = vi.fn();
    render(<Switch aria-label="On shift" onCheckedChange={onChange} />);
    const control = screen.getByRole('switch', { name: 'On shift' });
    control.focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenCalledWith(true);
    await expectNoAxeViolations();
  });
});
