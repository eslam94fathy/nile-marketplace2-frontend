// Compile-time check (run by `tsc`; no runtime import of @nile/api): every API image DTO renders with `NileImage`.
import type { components } from '@nile/api/schema';
import type { NileImageSource } from './nile-image';

type Schemas = components['schemas'];

export type ImageDtosRender = [
  Schemas['ImageDto'] extends NileImageSource ? true : never,
  Schemas['ProductImageDto'] extends NileImageSource ? true : never,
  Schemas['CategoryImageDto'] extends NileImageSource ? true : never,
];
