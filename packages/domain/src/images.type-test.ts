// Compile-time check (run by `tsc`; no runtime import of @nile/api): the product DTOs fit `variantImage`.
import type { components } from '@nile/api/schema';
import type { PositionedImage, ProductImages } from './images';

type Schemas = components['schemas'];

export type ProductDtosFit = [
  Schemas['ProductDetailDto'] extends ProductImages<Schemas['ProductImageDto']> ? true : never,
  Schemas['ProductImageDto'] extends PositionedImage ? true : never,
];
