// Orders copy (spec 01 SF-18-A3; the rest of SF-17/SF-18 comes with T-G3).
export const ORDERS_COPY = {
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
