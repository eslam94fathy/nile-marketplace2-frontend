'use client';

// Component gallery (T-C2): every core component in its states, for review and for the browser checks that
// jsdom can't do (colour contrast, focus outlines, layout). Demo copy only; not a product screen.
import { SELLER_ORDER_STATUS_LABELS, SELLER_ORDER_STATUSES } from '@nile/domain';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Badge, StatusBadge } from '../components/badge';
import { Button } from '../components/button';
import { Checkbox, Switch } from '../components/checkbox';
import { Countdown } from '../components/countdown';
import { ConfirmDialog, Dialog, DialogContent, DialogTrigger } from '../components/dialog';
import { Field, FormAlert } from '../components/field';
import { DateTime, Money } from '../components/formatted';
import { Input, Textarea } from '../components/input';
import { Select } from '../components/select';
import { EmptyState, ErrorState, LoadingRegion, Skeleton } from '../components/states';
import { toast, Toaster } from '../components/toast';
import { DataTable, type DataTableColumn } from '../data-table/data-table';
import { SELLER_ORDER_STATUS_TONES } from '../status-tones';

const SECTION = 'space-y-4';
const HEADING = 'text-xl font-semibold';

interface DemoForm {
  email: string;
  note: string;
  reason: string;
  agree: boolean;
  onShift: boolean;
}

interface DemoRow {
  id: string;
  order: string;
  total: string;
  createdAt: string;
}

const DEMO_ROWS: DemoRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `row-${index + 1}`,
  order: `NM-2026-00${index + 1}`,
  total: `${(index + 1) * 125}.50`,
  createdAt: `2026-10-${String(10 + index).padStart(2, '0')}T08:00:00.000Z`,
}));
const PAGE_SIZE = 3;

const COLUMNS: DataTableColumn<DemoRow>[] = [
  { id: 'order', header: 'Order', cell: (row) => row.order },
  {
    id: 'created',
    header: 'Placed',
    sortField: 'createdAt',
    firstDirection: 'desc',
    cell: (row) => <DateTime value={row.createdAt} />,
  },
  { id: 'total', header: 'Total', align: 'end', cell: (row) => <Money value={row.total} /> },
];

function FormDemo() {
  const form = useForm<DemoForm>({
    defaultValues: { email: '', note: '', reason: '', agree: false, onShift: true },
  });
  const [showAlert, setShowAlert] = useState(false);

  function showErrors() {
    form.setError('email', { message: 'Enter a valid email address.' });
    form.setError('reason', { message: 'Choose a reason.' });
    setShowAlert(true);
  }

  return (
    <form
      noValidate
      className="max-w-md space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {showAlert ? (
        <FormAlert correlationId="0b0e0f53-6f5a-4c43-9c39-9d1b1e0a2f10">
          Some fields need attention.
        </FormAlert>
      ) : null}
      <Field
        control={form.control}
        name="email"
        label="Email"
        description="We send order updates here."
        required
        render={({ field, controlProps }) => (
          <Input type="email" autoComplete="email" {...field} {...controlProps} />
        )}
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
            placeholder="Choose a reason"
            options={[
              { value: 'out_of_stock', label: 'Out of stock' },
              { value: 'seller_request', label: 'Seller request' },
              { value: 'other', label: 'Other' },
            ]}
          />
        )}
      />
      <Field
        control={form.control}
        name="note"
        label="Note"
        description="Optional, up to 500 characters."
        render={({ field, controlProps }) => <Textarea {...field} {...controlProps} />}
      />
      <Field
        control={form.control}
        name="agree"
        label="I collected the cash"
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
      <Field
        control={form.control}
        name="onShift"
        label="On shift"
        layout="inline"
        render={({ field, controlProps }) => (
          <Switch {...controlProps} checked={field.value} onCheckedChange={field.onChange} />
        )}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={showErrors}>Show errors</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
      </div>
    </form>
  );
}

function TableDemo() {
  const [sort, setSort] = useState('-createdAt');
  const [pages, setPages] = useState(1);
  const sorted = [...DEMO_ROWS].sort((a, b) =>
    sort === 'createdAt' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
  );
  const rows = sorted.slice(0, pages * PAGE_SIZE);
  return (
    <DataTable
      caption="Recent orders"
      showCaption
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        setPages(1);
      }}
      empty={<EmptyState title="No orders yet." />}
      hasMore={rows.length < DEMO_ROWS.length}
      loadingMore={false}
      onLoadMore={() => {
        setPages((value) => value + 1);
      }}
    />
  );
}

export function ComponentGallery() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  // A fixed deadline one hour after first render, so the countdown shows the long format.
  const [deadline] = useState(() => new Date(Date.now() + 65 * 60_000).toISOString());

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Components</h1>
        <p className="text-muted-foreground">
          The core components of the Nile design system and their states.
        </p>
      </header>

      <section aria-labelledby="gallery-buttons" className={SECTION}>
        <h2 id="gallery-buttons" className={HEADING}>
          Buttons
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Delete</Button>
          <Button variant="link">Link</Button>
          <Button loading>Saving</Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </section>

      <section aria-labelledby="gallery-form" className={SECTION}>
        <h2 id="gallery-form" className={HEADING}>
          Form fields
        </h2>
        <FormDemo />
      </section>

      <section aria-labelledby="gallery-badges" className={SECTION}>
        <h2 id="gallery-badges" className={HEADING}>
          Status badges (seller view)
        </h2>
        <ul className="flex flex-wrap gap-2">
          {SELLER_ORDER_STATUSES.map((status) => (
            <li key={status}>
              <StatusBadge
                value={status}
                labels={SELLER_ORDER_STATUS_LABELS.seller}
                tones={SELLER_ORDER_STATUS_TONES}
              />
            </li>
          ))}
          <li>
            <Badge>Default</Badge>
          </li>
        </ul>
      </section>

      <section aria-labelledby="gallery-values" className={SECTION}>
        <h2 id="gallery-values" className={HEADING}>
          Money, dates, countdown
        </h2>
        <dl className="grid max-w-md grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">Total</dt>
          <dd>
            <Money value="1250.5" />
          </dd>
          <dt className="text-muted-foreground">Price range</dt>
          <dd>
            <Money value="51.00" max="71.00" />
          </dd>
          <dt className="text-muted-foreground">Placed</dt>
          <dd>
            <DateTime value="2026-10-14T07:30:00.000Z" />
          </dd>
          <dt className="text-muted-foreground">Time left to confirm</dt>
          <dd>
            <Countdown deadline={deadline} label="Time left to confirm" />
          </dd>
        </dl>
      </section>

      <section aria-labelledby="gallery-overlays" className={SECTION}>
        <h2 id="gallery-overlays" className={HEADING}>
          Dialogs, sheets and toasts
        </h2>
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent title="Edit address" description="Changes apply to new orders only.">
              <p className="text-sm">Dialog content goes here.</p>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open sheet</Button>
            </DialogTrigger>
            <DialogContent title="Filters" placement="end">
              <p className="text-sm">Sheet content goes here.</p>
            </DialogContent>
          </Dialog>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirmOpen(true);
            }}
          >
            Cancel order
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Profile saved.', tone: 'success' })}>
            Success toast
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: 'Something went wrong. Please try again.',
                tone: 'destructive',
                correlationId: '0b0e0f53-6f5a-4c43-9c39-9d1b1e0a2f10',
              })
            }
          >
            Error toast
          </Button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Cancel the whole order?"
          description="The customer will be informed and the stock released."
          confirmLabel="Cancel order"
          cancelLabel="Keep order"
          destructive
          onConfirm={() => new Promise((resolve) => setTimeout(resolve, 800))}
        />
      </section>

      <section aria-labelledby="gallery-states" className={SECTION}>
        <h2 id="gallery-states" className={HEADING}>
          Empty, error and loading
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          <EmptyState
            title="Your cart is empty."
            description="Browse categories to find something you like."
            action={<Button variant="outline">Browse categories</Button>}
          />
          <ErrorState onRetry={() => undefined} correlationId="0b0e0f53-6f5a-4c43-9c39-9d1b1e0a2f10" />
          <LoadingRegion className="space-y-2">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </LoadingRegion>
        </div>
      </section>

      <section aria-labelledby="gallery-table" className={SECTION}>
        <h2 id="gallery-table" className={HEADING}>
          Data table
        </h2>
        <TableDemo />
      </section>

      <Toaster />
    </div>
  );
}
