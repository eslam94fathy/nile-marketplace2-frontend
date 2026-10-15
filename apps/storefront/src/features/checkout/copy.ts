// Checkout copy (spec 01 SF-07, SF-08).
export const CHECKOUT_COPY = {
  title: 'Checkout',
  addressHeading: 'Delivery address',
  addressLegend: 'Choose a delivery address',
  default: 'Default',
  notDeliverable: (governorate: string) => `We don't deliver to ${governorate} yet.`,
  thisArea: 'this area',
  addAddress: 'Add a new address',
  paymentHeading: 'Payment method',
  paymentLegend: 'Choose a payment method',
  payment: {
    cod: {
      label: 'Cash on delivery',
      description: 'Pay the delivery agent in cash when your order arrives.',
    },
    kashier: {
      label: 'Pay by card (Kashier)',
      description: (minutes: number) =>
        `You'll be redirected to Kashier's secure page. You have ${minutes} minutes to pay; until then your items are reserved.`,
    },
  },
  reviewHeading: 'Review your order',
  soldBy: (businessName: string) => `Sold by ${businessName}`,
  quantity: (quantity: number) => `Qty ${quantity}`,
  parcels: (count: number) =>
    `Your order will be delivered in ${count} separate parcels, one per seller. You pay one delivery fee.`,
  summaryHeading: 'Order summary',
  itemsTotal: (count: number) => `Items (${count})`,
  deliveryFee: 'Delivery fee',
  total: 'Total',
  noAddressYet: '—',
  placeOrder: 'Place order',
  placing: 'Placing your order…',
  chooseToContinue: 'Choose a delivery address and a payment method to place your order.',
  loadFailed: "Checkout couldn't be loaded.",
  errors: {
    ADDRESS_NOT_FOUND: 'This address no longer exists. Please choose another.',
    GOVERNORATE_NOT_DELIVERABLE: "We don't deliver to this area any more.",
  },
  totalChanged: {
    title: 'Your total has changed',
    message: (total: string) => `Prices or the delivery fee changed. Your new total is ${total}.`,
    confirm: 'Place order',
    cancel: 'Go back',
  },
  paymentPending: {
    title: 'An order is waiting for payment',
    message:
      'You already have an order waiting for card payment. Pay for it or wait until it expires before placing another card order.',
    goToOrder: 'Go to that order',
    close: 'Close',
  },
  // SF-09, SF-18-A2
  kashier: {
    payNow: 'Pay now',
    timeLeft: 'Time left to pay',
    returnTitle: 'Payment',
    confirming: 'Confirming your payment…',
    paid: (orderNumber: string) => `Payment received. Your order ${orderNumber} is placed.`,
    cancelled: "Your payment wasn't completed in time and the order was cancelled.",
    stillWaiting:
      "We're still waiting for confirmation from the payment provider. Check your order page in a few minutes.",
    notFound: "We couldn't find your order.",
    yourOrders: 'Your orders',
    goToOrder: 'Go to your order',
    loadFailed: "Your payment couldn't be checked.",
    errors: {
      ORDER_NOT_AWAITING_PAYMENT: 'This order is no longer waiting for payment.',
      PAYMENT_PROVIDER_UNAVAILABLE: "The payment provider isn't responding. Please try again in a moment.",
    },
  },
  // SF-08
  confirmation: {
    title: 'Order placed',
    thanks: (orderNumber: string) => `Thank you. Your order ${orderNumber} is placed.`,
    status: (orderNumber: string, status: string) => `Order ${orderNumber}: ${status}`,
    payCod: (total: string) => `Pay ${total} in cash on delivery.`,
    addressHeading: 'Delivery address',
    viewOrder: 'View order',
    continueShopping: 'Continue shopping',
    loadFailed: "Your order couldn't be loaded.",
  },
} as const;
