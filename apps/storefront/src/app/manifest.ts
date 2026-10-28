import type { MetadataRoute } from 'next';
import { webAppManifest } from '@nile/ui/manifest';
import { APP } from '@/lib/app';

/** Web app manifest (design 01 §15.5, FR2-Q2): installable, which iPhone and iPad need for push. */
export default function manifest(): MetadataRoute.Manifest {
  return webAppManifest(APP.title);
}
