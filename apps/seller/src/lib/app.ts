/** Identity of this app. Ports are fixed in CLAUDE.md §2 (outside the Windows-excluded ranges on the dev machine). */
export const APP = {
  name: 'seller',
  title: 'Nile Seller',
  /** The portal's name next to the logo (T-J2); with the logo's "Nile" it reads as `title`. */
  roleLabel: 'Seller',
  devPort: 4101,
} as const;
