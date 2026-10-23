// Agent status, shift switch and Me copy (spec 04 §2.2, AG-02, AG-03).

export const PROFILE_COPY = {
  inactive: 'Your account is inactive. Contact your admin.',
  onShift: 'On shift',
  offShift: 'Off shift',
  shiftLabel: 'Shift',
  goOffTitle: 'Go off shift?',
  goOffConfirm: (count: number) =>
    `You won't get new shipments. You still need to finish the ${count} you have.`,
  goOff: 'Go off shift',
  nowOn: "You're on shift.",
  nowOff: "You're off shift.",

  // AG-02
  meTitle: 'Me',
  loadFailed: "Your profile couldn't be loaded.",
  fullName: 'Name',
  email: 'Email',
  phone: 'Phone',
  homeGovernorate: 'Home governorate',
  status: 'Status',
  shift: 'Shift',
  activeShipments: 'Active shipments',
  contactAdmin: 'To change your details, contact your admin.',
  security: 'Security',
} as const;
