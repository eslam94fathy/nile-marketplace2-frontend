import { APP } from '@/lib/app';

export default function HomePage() {
  return (
    <main>
      <h1>{APP.title}</h1>
      <p>This app for shoppers is being built.</p>
    </main>
  );
}
