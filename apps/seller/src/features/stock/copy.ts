// Stock copy (spec 02 SE-12, SE-13). Movement type labels: @nile/domain STOCK_MOVEMENT_TYPE_LABELS.

const units = (count: number) => `${count} ${count === 1 ? 'unit' : 'units'}`;

export const STOCK_COPY = {
  // SE-12
  adjust: 'Adjust stock',
  adjustAction: (sku: string) => `Adjust stock of ${sku}`,
  title: (sku: string) => `Adjust stock · ${sku}`,
  onHand: 'On hand',
  reserved: 'Reserved',
  sellable: 'Sellable',
  modeLabel: 'Change',
  modes: { add: 'Add', remove: 'Remove', set: 'Set on-hand count to…' },
  quantity: 'Quantity',
  target: 'On-hand count',
  setHelp:
    "Use this after counting your shelf. Remember on hand includes units in orders that haven't been delivered yet.",
  wholeNumber: (min: number) => `Enter a whole number from ${min} to 100000.`,
  effect: (delta: number, onHand: number) =>
    delta > 0
      ? `This will add ${units(delta)} (on hand ${onHand} → ${onHand + delta}).`
      : `This will remove ${units(-delta)} (on hand ${onHand} → ${onHand + delta}).`,
  noChange: 'No change needed.',
  tooLarge: 'A single change can add or remove at most 100000 units.',
  belowReserved: (sellable: number, reserved: number) =>
    `You can remove at most ${units(sellable)}: ${units(reserved)} ${reserved === 1 ? 'is' : 'are'} reserved for open orders.`,
  loading: 'Reading the current stock…',
  loadFailed: "The current stock couldn't be read.",
  submit: 'Adjust stock',
  done: 'Stock updated.',
  stale: 'Stock changed meanwhile. Please check the numbers and try again.',
  variantGone: 'This variant no longer exists.',

  // SE-13
  history: 'History',
  historyAction: (sku: string) => `Stock history of ${sku}`,
  historyTitle: (sku: string) => `Stock history · ${sku}`,
  historyNote: 'Change shows the effect on sellable stock.',
  caption: 'Stock movements',
  columns: {
    date: 'Date',
    type: 'Movement',
    change: 'Change',
    onHand: 'On hand after',
    reserved: 'Reserved after',
    reference: 'Reference',
  },
  orderItem: 'Order item',
  empty: 'No stock movements yet.',
  historyFailed: "The stock history couldn't be loaded.",
  backToProduct: 'Back to the product',
} as const;
