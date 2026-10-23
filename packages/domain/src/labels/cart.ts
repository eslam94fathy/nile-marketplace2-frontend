import type { CartLineIssue } from '../enums';

/** Spec 01 SF-06 line notices; `availableQuantity` comes from the cart line. */
export function cartLineIssueMessage(issue: CartLineIssue, availableQuantity: number): string {
  switch (issue) {
    case 'UNAVAILABLE':
      return 'This item is no longer available.';
    case 'OUT_OF_STOCK':
      return 'Out of stock.';
    case 'INSUFFICIENT_STOCK':
      return `Only ${availableQuantity} available.`;
  }
}
