import { PlaceholderScreen } from '@nile/ui';

// No own title: the root layout's default ("Nile") is the home page title. A title template only applies to
// child segments, so a title here would replace the brand instead of extending it.
export default function HomePage() {
  return <PlaceholderScreen title="Home" task="T-E1" />;
}
