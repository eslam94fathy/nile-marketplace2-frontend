// AD-08 Governorates and agent share copy (spec 03).

export const DELIVERY_COPY = {
  title: 'Delivery settings',

  // Agent share
  shareHeading: 'Agent share of the delivery fee',
  shareCurrent: 'Current agent share',
  shareUpdated: (date: string) => `Last changed ${date}`,
  shareLoadFailed: "The agent share couldn't be loaded.",
  shareRate: 'New agent share (%)',
  shareSave: 'Save agent share',
  shareConfirmTitle: 'Change the agent share',
  shareConfirm: (percent: string) =>
    `Set the agent share to ${percent}? Applies to new orders only. Nile keeps the rest of the fee.`,
  shareSaved: (percent: string) => `The agent share is now ${percent}.`,

  // Governorates
  governoratesHeading: 'Governorates',
  governoratesNote: 'Fee changes apply to new orders only.',
  governoratesCaption: 'Governorates and delivery fees',
  governoratesFailed: "The governorates couldn't be loaded.",
  columns: {
    name: 'Governorate',
    code: 'Code',
    fee: 'Delivery fee',
    deliverable: 'Deliverable',
    actions: 'Actions',
  },
  noFee: '—',
  deliverable: 'Deliverable',
  notDeliverable: 'Not deliverable',
  setFee: 'Set fee',
  setFeeFor: (name: string) => `Set fee for ${name}`,
  feeTitle: (name: string) => `Delivery fee for ${name}`,
  fee: 'Delivery fee (EGP)',
  feeSave: 'Save fee',
  feeSaved: (name: string, fee: string) => `${name}: delivery fee ${fee}.`,
  stop: 'Stop delivering',
  stopFor: (name: string) => `Stop delivering to ${name}`,
  stopConfirm: (name: string) => `Customers can't check out to ${name} until you set a fee again.`,
  stopped: (name: string) => `${name} is no longer deliverable.`,
  gone: 'This governorate no longer exists. The list was reloaded.',
} as const;
