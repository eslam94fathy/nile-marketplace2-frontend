/** Identity of this app. Ports are fixed in CLAUDE.md §2 (outside the Windows-excluded ranges on the dev machine). */
export const APP = {
  name: 'agent',
  title: 'Nile Delivery',
  /** The portal's name next to the logo (T-J2); with the logo's "Nile" it reads as `title`. */
  roleLabel: 'Delivery',
  devPort: 4103,
} as const;
