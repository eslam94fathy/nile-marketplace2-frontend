// Orders copy (spec 01 SF-17, SF-18).
export const ORDERS_COPY = {
  title: 'Your orders',
  tabsLabel: 'Order status',
  tabs: {
    all: 'All',
    awaitingPayment: 'Awaiting payment',
    inProgress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
  },
  emptyAll: "You haven't placed any orders yet.",
  emptyTab: 'No orders here.',
  startShopping: 'Start shopping',
  listLoadFailed: "Your orders couldn't be loaded.",
  order: (orderNumber: string) => `Order ${orderNumber}`,
  contents: (items: number, sellers: number) =>
    `${items} ${items === 1 ? 'item' : 'items'} from ${sellers} ${sellers === 1 ? 'seller' : 'sellers'}`,
  // SF-18
  placedOn: (date: string) => `Placed ${date}`,
  paymentHeading: 'Payment',
  // SF-18-A1
  cancel: {
    label: 'Cancel',
    action: (businessName: string) => `Cancel the items from ${businessName}`,
    title: 'Cancel these items',
    confirm: (businessName: string) => `Cancel the items from ${businessName}? This can't be undone.`,
    refund: 'Your card will be refunded automatically.',
    note: 'Reason (optional)',
    confirmAction: 'Cancel items',
    keep: 'Keep them',
    notCancellable:
      "The seller has already confirmed this part of your order, so it can't be cancelled here.",
  },
  // SF-18-A2
  payNow: {
    action: 'Pay now',
    errors: {
      ORDER_NOT_AWAITING_PAYMENT: 'This order is no longer waiting for payment.',
      PAYMENT_PROVIDER_UNAVAILABLE: "The payment provider isn't responding. Please try again in a moment.",
    },
  },
  timeLeft: 'Time left to pay',
  addressHeading: 'Delivery address',
  soldBy: (businessName: string) => `Sold by ${businessName}`,
  sku: (sku: string) => `SKU: ${sku}`,
  priceTimesQuantity: (price: string, quantity: number) => `${price} × ${quantity}`,
  cancelledBySeller: (quantity: number) => `${quantity} cancelled by the seller`,
  openQuantity: (quantity: number) => `${quantity} still ordered`,
  subtotal: 'Subtotal',
  /** Spec 01 §10.3 SF-18 actions (SF-26 entry). */
  returnItems: 'Return items',
  timelineHeading: 'History',
  itemsTotal: 'Items total',
  deliveryFee: 'Delivery fee',
  total: 'Total',
  /** Spec 01 §10.3: "Coupon {code} −{discountTotal}"; the amount follows as a negative. */
  couponLine: (code: string) => `Coupon ${code}`,
  /** TK4-COPY: a parcel's share of the coupon, under its subtotal. */
  sellerShare: 'Coupon discount',
  /** Read for the struck-through original line total (as SF-05's compare-at price). */
  was: (amount: string) => `Was ${amount}`,
  notes: {
    excluded: "Cancelled or returned parcels aren't included in the total.",
    noFee: 'No delivery fee is charged because nothing was delivered.',
    refunds: 'Card refunds go back to your card automatically. Your bank may take a few days to show them.',
  },
  detailLoadFailed: "This order couldn't be loaded.",
  backToOrders: 'Your orders',
  detailTitle: 'Order',
  buyAgain: {
    action: 'Buy again',
    confirmTitle: 'Buy again',
    confirm: 'Add the items from this order to your cart? Current prices apply.',
    confirmAction: 'Add to cart',
    resultTitle: 'Items added to your cart',
    added: 'Added',
    outcomes: {
      VARIANT_NOT_PURCHASABLE: 'No longer available',
      INSUFFICIENT_STOCK: 'Not enough stock',
      CART_ITEM_QUANTITY_LIMIT: 'Would exceed 99 in your cart',
      CART_LINE_LIMIT_REACHED: 'Your cart is full',
      skipped: 'Not added: your cart is full',
      failed: 'Not added',
    },
    interrupted: "We couldn't confirm every item was added. Check your cart.",
    goToCart: 'Go to cart',
  },
} as const;
