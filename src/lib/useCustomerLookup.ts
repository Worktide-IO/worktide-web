import { useMany } from '@refinedev/core';
import { useMemo } from 'react';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { Row } from '@/lib/refine';

/**
 * Resolve a set of customer IRIs to their records, keyed by IRI.
 *
 * Do NOT load the whole customer list to look up names: a workspace can have
 * thousands of customers and the API caps a page at 200, so any customer past
 * the first page silently resolved to "no customer". This fetches exactly the
 * referenced customers by id (useMany → parallel getOne), so display is correct
 * regardless of how many customers exist.
 */
export function useCustomerLookup(
  customerIris: Array<string | null | undefined>,
): Record<string, Row<CustomerJsonld>> {
  const key = (customerIris ?? []).filter((i): i is string => Boolean(i)).join('|');

  const ids = useMemo(
    () =>
      key === ''
        ? []
        : Array.from(
            new Set(
              key
                .split('|')
                .map((iri) => iri.split('/').pop() ?? '')
                .filter((id) => id !== ''),
            ),
          ),
    [key],
  );

  const { result } = useMany<Row<CustomerJsonld>>({
    resource: 'customers',
    ids,
    queryOptions: { enabled: ids.length > 0 },
  });

  return useMemo(() => {
    const map: Record<string, Row<CustomerJsonld>> = {};
    for (const c of result?.data ?? []) {
      if (c['@id']) map[c['@id']] = c;
    }
    return map;
  }, [result]);
}
