import type { Metadata } from 'next';
import { ADDRESS_COPY, AddressBook } from '@/features/addresses';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: ADDRESS_COPY.book.title };

/** SF-16 Addresses: shell on the server, the address book on the client. */
export default async function AddressesPage() {
  await requireSession();
  return <AddressBook />;
}
