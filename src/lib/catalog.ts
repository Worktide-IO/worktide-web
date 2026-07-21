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
  /** IRIs of attached tags (scope 'product' or 'any'). */
  tags?: string[];
};

export type ProductVersionJsonld = HydraItemBaseSchema & {
  id?: string | null;
  product?: string;
  version: string;
  releaseDate?: string | null;
  releaseNotes?: string | null;
  status?: ProductVersionStatus;
  isLatest?: boolean;
  /** IRIs of features attached to this version. */
  features?: string[];
};

export type ProductFeatureKind = 'new' | 'improved' | 'fixed';

export type ProductFeatureJsonld = HydraItemBaseSchema & {
  id?: string | null;
  version?: string;
  name: string;
  description?: string | null;
  position?: number;
  icon?: string | null;
  kind?: ProductFeatureKind | null;
};

export const FEATURE_KIND_BADGE: Record<
  ProductFeatureKind,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  new: { label: 'product.feature_kind.new', variant: 'default' },
  improved: { label: 'product.feature_kind.improved', variant: 'secondary' },
  fixed: { label: 'product.feature_kind.fixed', variant: 'outline' },
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
  product: 'product.type.product',
  service: 'product.type.service',
};

export const PRODUCT_STATUS_BADGE: Record<
  ProductStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'product.status.active', variant: 'default' },
  deprecated: { label: 'product.status.deprecated', variant: 'secondary' },
  eol: { label: 'product.status.eol', variant: 'destructive' },
};

export const VERSION_STATUS_BADGE: Record<
  ProductVersionStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  current: { label: 'product.version_status.current', variant: 'default' },
  supported: { label: 'product.version_status.supported', variant: 'secondary' },
  deprecated: { label: 'product.version_status.deprecated', variant: 'outline' },
  eol: { label: 'product.version_status.eol', variant: 'destructive' },
};

export const CUSTOMER_PRODUCT_STATUS_BADGE: Record<
  CustomerProductStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'customer_product.status.active', variant: 'default' },
  churned: { label: 'customer_product.status.churned', variant: 'outline' },
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
