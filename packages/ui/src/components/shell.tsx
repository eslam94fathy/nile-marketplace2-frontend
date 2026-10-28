import type { ReactNode } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { NileLogoShort } from './logo';

// Building blocks shared by the four app shells (T-C3). Links stay in the apps (Next.js `Link` with typed
// routes); this package only provides markup and styling, so it never imports Next.js.

/** `id` of every shell's `<main>`: the skip link's target. */
export const MAIN_CONTENT_ID = 'main';

/** First focusable element of every page (WCAG 2.4.1): visible only when focused. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[200] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-primary focus:shadow-lg"
    >
      {UI_COPY.skipToContent}
    </a>
  );
}

/** Classes of a navigation link; `aria-current="page"` marks the active one (also for screen readers). */
export function navLinkClasses(active: boolean, className?: string): string {
  return cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors [&_svg]:size-4 [&_svg]:shrink-0',
    active ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-muted',
    className,
  );
}

/** Whether `href` is the current section: exact for the home route, prefix match otherwise. */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface PortalBrandProps {
  /** The portal's name after the logo, e.g. `Seller`; with the logo's "Nile" it reads "Nile Seller". */
  readonly roleLabel: string;
}

/** Brand of the seller, admin and agent portals (T-J2): the short logo and the portal's name, inside the app's link. */
export function PortalBrand({ roleLabel }: PortalBrandProps) {
  return (
    <span className="flex items-center gap-2">
      <NileLogoShort label={UI_COPY.brandName} className="h-8 w-auto" />
      {/* Separates the two words of the accessible name; the flex layout ignores it. */}{' '}
      <span className="text-lg font-semibold text-nile-900">{roleLabel}</span>
    </span>
  );
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
}

/** The page's `<h1>` (focus target after route changes, conventions §10) with optional actions. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description === undefined ? null : <p className="text-muted-foreground">{description}</p>}
      </div>
      {actions === undefined ? null : <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export interface PlaceholderScreenProps {
  readonly title: string;
  /** Implementation-plan task that builds the screen, e.g. `T-E2`. */
  readonly task: string;
}

/** Stand-in for a screen that a later task builds (T-C3 decision: navigation works end to end). */
export function PlaceholderScreen({ title, task }: PlaceholderScreenProps) {
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <p className="rounded-lg border border-dashed border-input p-6 text-muted-foreground">
        {UI_COPY.placeholder(task)}
      </p>
    </div>
  );
}

export interface NotFoundScreenProps {
  readonly message?: string;
  /** A link back to the app's home (the app passes its own `Link`). */
  readonly homeLink: ReactNode;
}

export function NotFoundScreen({ message = UI_COPY.notFoundMessage, homeLink }: NotFoundScreenProps) {
  return (
    <div className="flex flex-col items-center gap-4 px-4 py-16 text-center">
      <h1 className="text-2xl font-semibold">{UI_COPY.notFoundTitle}</h1>
      <p className="max-w-prose text-muted-foreground">{message}</p>
      {homeLink}
    </div>
  );
}
