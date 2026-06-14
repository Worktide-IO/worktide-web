/**
 * Thin adapter layer between the kubb-generated API shapes and Refine's
 * generic constraints.
 *
 * Why this exists: API Platform's OpenAPI spec marks each entity's `id`
 * field as `string | null` (nullable because POST bodies don't carry an
 * id yet). Refine's `BaseRecord` requires `id?: string | number` — `null`
 * is not assignable. The intersection here drops the `null` from `id`
 * without changing any other field, so generated `*Jsonld` types stay
 * usable directly in `useList<Row<XxxJsonld>>()` etc.
 */
export type Row<T> = Omit<T, 'id'> & { id?: string };
