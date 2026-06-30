import type { HydraItemBaseSchema } from '@/api/types/HydraItemBaseSchema.ts';
import { api } from '@/lib/api';

/**
 * Contract-management (customer agreements) domain types + helpers.
 *
 * Hand-authored — like {@link ./social.ts} — because `pnpm gen:api` (kubb) is
 * currently broken on Node 24, so these backend resources aren't in
 * `src/api/types` yet. They mirror the worktide backend exactly
 * (AgreementType / CustomerAgreement / AgreementStatus + the slug convenience
 * endpoint). Swap to the generated types once gen:api is fixed.
 */

export type AgreementStatus =
  | 'none'
  | 'draft'
  | 'in_negotiation'
  | 'signed'
  | 'expired'
  | 'superseded'
  | 'terminated';

export type AgreementTypeJsonld = HydraItemBaseSchema & {
  id?: string | null;
  name: string;
  slug: string;
  description?: string | null;
  isMandatory?: boolean;
  position?: number;
  isArchived?: boolean;
};

export type CustomerAgreementJsonld = HydraItemBaseSchema & {
  id?: string | null;
  customer?: string;
  type?: string;
  /** Mirror of the type's slug — the simple key. */
  typeSlug?: string;
  status?: AgreementStatus;
  signedOn?: string | null;
  validUntil?: string | null;
  isSigned?: boolean;
  notes?: string | null;
};

export const AGREEMENT_STATUS_BADGE: Record<
  AgreementStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  none: { label: 'Nicht vorhanden', variant: 'outline' },
  draft: { label: 'Entwurf', variant: 'outline' },
  in_negotiation: { label: 'In Abstimmung', variant: 'secondary' },
  signed: { label: 'Abgeschlossen', variant: 'default' },
  expired: { label: 'Abgelaufen', variant: 'destructive' },
  superseded: { label: 'Ersetzt', variant: 'outline' },
  terminated: { label: 'Gekündigt', variant: 'destructive' },
};

/** Statuses a human sets directly; the rest (none/expired/superseded) are derived. */
export const SETTABLE_STATUSES: { value: AgreementStatus; label: string }[] = [
  { value: 'draft', label: 'Entwurf' },
  { value: 'in_negotiation', label: 'In Abstimmung' },
  { value: 'signed', label: 'Abgeschlossen (unterzeichnet)' },
  { value: 'terminated', label: 'Gekündigt' },
];

export type AgreementSetInput = {
  status: AgreementStatus;
  signedOn?: string | null;
  validUntil?: string | null;
  reference?: string | null;
  notes?: string | null;
  fileId?: string | null;
};

/** Shape returned by the slug convenience endpoint. */
export type AgreementState = {
  customerId: string;
  agreementId: string | null;
  typeSlug: string;
  status: AgreementStatus;
  isSigned: boolean;
  signedOn: string | null;
  validUntil: string | null;
  currentVersion: number | null;
  pendingVersion: number | null;
};

/**
 * Slug-keyed convenience facade — get/set a customer's contract by simple key,
 * matching the backend's `/v1/customers/{id}/agreements/{slug}` endpoints.
 */
export const agreementActions = {
  get: (customerId: string, slug: string) =>
    api.get<AgreementState>(`/customers/${customerId}/agreements/${slug}`).then((r) => r.data),
  set: (customerId: string, slug: string, input: AgreementSetInput) =>
    api.put<AgreementState>(`/customers/${customerId}/agreements/${slug}`, input).then((r) => r.data),
};

/** Normalise an API date (ISO datetime or Y-m-d) to a `YYYY-MM-DD` input value. */
export function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

/** Summary returned by the multipart file-upload endpoint. */
export type UploadedFile = {
  id: string;
  name?: string;
  mimeType?: string;
};

/**
 * Upload a signed document into the customer's document store
 * (`POST /v1/files`, target=customer). Returns the new File's id, which is
 * passed as `fileId` when recording the agreement.
 */
export async function uploadCustomerFile(
  customerId: string,
  file: File,
  name?: string,
): Promise<UploadedFile> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('target', 'customer');
  fd.append('targetId', customerId);
  if (name) fd.append('name', name);
  // Let axios derive the multipart boundary for the FormData body.
  const { data } = await api.post<UploadedFile>('/files', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
