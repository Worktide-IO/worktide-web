import type { HydraItemBaseSchema } from '@/api/types/HydraItemBaseSchema.ts';
import { api } from '@/lib/api';

/**
 * Versioned service catalogue domain types + helpers.
 *
 * Hand-authored (like ./catalog.ts and ./agreements.ts) because `pnpm gen:api`
 * (kubb) is currently broken on Node 24. Mirrors the backend Service /
 * ServiceVersion / ServiceAssignment resources; swap to generated types once
 * codegen is fixed.
 */

export type ServiceBillingCycle = 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'once';
export type ServiceAssignmentStatus = 'trial' | 'active' | 'paused' | 'cancelled';

export type ServiceJsonld = HydraItemBaseSchema & {
  id?: string | null;
  name: string;
  description?: string | null;
  category?: string | null;
  active?: boolean;
  /** IRI of the current (published) version. */
  currentVersion?: string | null;
};

export type ServiceVersionJsonld = HydraItemBaseSchema & {
  id?: string | null;
  service?: string;
  versionNo?: number;
  label?: string | null;
  changelog?: string | null;
  netPriceCents?: number;
  currency?: string;
  billingCycle?: ServiceBillingCycle;
  effectiveFrom?: string | null;
  isCurrent?: boolean;
};

export type ServiceAssignmentJsonld = HydraItemBaseSchema & {
  id?: string | null;
  customer?: string;
  system?: string | null;
  serviceVersion?: string;
  startedOn?: string;
  endedOn?: string | null;
  notes?: string | null;
  status?: ServiceAssignmentStatus;
  autoRenew?: boolean;
  netPriceOverrideCents?: number | null;
  nextBillingOn?: string | null;
  /** Serialized from getEffectivePriceCents() (override or version price). */
  effectivePriceCents?: number;
};

export const SERVICE_BILLING_LABEL: Record<ServiceBillingCycle, string> = {
  monthly: 'billing.monthly',
  quarterly: 'billing.quarterly',
  half_yearly: 'billing.half_yearly',
  yearly: 'billing.yearly',
  once: 'billing.once',
};

export const SERVICE_BILLING_CYCLES: ServiceBillingCycle[] = [
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'once',
];

export const SERVICE_ASSIGNMENT_STATUS_BADGE: Record<
  ServiceAssignmentStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  trial: { label: 'subscription_status.trial', variant: 'outline' },
  active: { label: 'subscription_status.active', variant: 'default' },
  paused: { label: 'subscription_status.paused', variant: 'secondary' },
  cancelled: { label: 'subscription_status.cancelled', variant: 'destructive' },
};

export type ServiceReleaseInput = {
  netPriceCents: number;
  currency?: string;
  billingCycle: ServiceBillingCycle;
  label?: string | null;
  changelog?: string | null;
  effectiveFrom?: string | null;
};

/** Publish a new version of a service (canonical create path — there is no POST on service_versions). */
export function releaseServiceVersion(serviceId: string, input: ServiceReleaseInput) {
  return api.post(`/services/${serviceId}/versions`, input).then(
    (r) =>
      r.data as {
        id: string;
        serviceId: string;
        versionNo: number;
        netPriceCents: number;
        currency: string;
        billingCycle: string;
        isCurrent: boolean;
      },
  );
}

/** Normalise an API date (ISO datetime or Y-m-d) to a `YYYY-MM-DD` input value. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}
