import type { HydraItemBaseSchema } from '@/api/types/HydraItemBaseSchema.ts';

/**
 * Industry ("Branche") — a workspace-managed controlled vocabulary a customer
 * can be assigned to. Hand-authored (gen:api broken on Node 24); mirrors the
 * backend Industry resource.
 */
export type IndustryJsonld = HydraItemBaseSchema & {
  id?: string | null;
  name: string;
  position?: number;
  isArchived?: boolean;
};
