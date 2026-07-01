import type { HydraItemBaseSchema } from '@/api/types/HydraItemBaseSchema.ts';
import { api } from '@/lib/api';

/**
 * Product/service catalogue domain types + helpers.
 *
 * Hand-authored (like ./agreements.ts and ./social.ts) because `pnpm gen:api`
 * (kubb) is currently broken on Node 24. Mirrors the backend Product /
 * ProductVersion / CustomerProduct resources; swap to generated types once
 * codegen is fixed.
 */

export type ProductType = 'product' | 'service';
export type ProductStatus = 'active' | 'deprecated' | 'eol';
export type ProductVersionStatus = 'current' | 'supported' | 'deprecated' | 'eol';
export type CustomerProductStatus = 'active' | 'churned';

export type ProductJsonld = HydraItemBaseSchema & {
  id?: string | null;
  name: string;
  slug: string;
  type: ProductType;
  status?: ProductStatus;
  description?: string | null;
  category?: string | null;
  /** IRI of the newest version. */
  latestVersion?: string | null;
};

export type ProductVersionJsonld = HydraItemBaseSchema & {
  id?: string | null;
  product?: string;
  version: string;
  releaseDate?: string | null;
  releaseNotes?: string | null;
  status?: ProductVersionStatus;
  isLatest?: boolean;
};

export type CustomerProductJsonld = HydraItemBaseSchema & {
  id?: string | null;
  customer?: string;
  product?: string;
  productVersion?: string | null;
  system?: string | null;
  status?: CustomerProductStatus;
  acquiredAt?: string | null;
  notes?: string | null;
};

export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  product: 'Produkt',
  service: 'Service',
};

export const PRODUCT_STATUS_BADGE: Record<
  ProductStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'Aktiv', variant: 'default' },
  deprecated: { label: 'Abgekündigt', variant: 'secondary' },
  eol: { label: 'EOL', variant: 'destructive' },
};

export const VERSION_STATUS_BADGE: Record<
  ProductVersionStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  current: { label: 'Aktuell', variant: 'default' },
  supported: { label: 'Unterstützt', variant: 'secondary' },
  deprecated: { label: 'Abgekündigt', variant: 'outline' },
  eol: { label: 'EOL', variant: 'destructive' },
};

export const CUSTOMER_PRODUCT_STATUS_BADGE: Record<
  CustomerProductStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'Aktiv', variant: 'default' },
  churned: { label: 'Beendet', variant: 'outline' },
};

export type ReleaseInput = {
  version: string;
  releaseDate?: string | null;
  releaseNotes?: string | null;
};

/** Ship a new product version (maintains latest-version bookkeeping server-side). */
export function releaseVersion(productId: string, input: ReleaseInput) {
  return api
    .post(`/products/${productId}/release`, input)
    .then((r) => r.data as { id: string; version: string; isLatest: boolean });
}

/** Normalise an API date (ISO datetime or Y-m-d) to a `YYYY-MM-DD` input value. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}
