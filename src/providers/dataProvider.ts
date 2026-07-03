import type { DataProvider } from '@refinedev/core';
import { api, API_BASE } from '@/lib/api';

/**
 * Per-resource memory of whether `getMany` can batch via `?id[]=` (i.e. the
 * resource exposes a uuid `id` filter). We probe once: if the batched response
 * only contains requested ids the filter is live (→ true); if the server
 * ignored the param and returned unrelated rows we fall back to per-id fetches
 * and remember not to try again (→ false). Undefined = not probed yet.
 */
const idBatchable = new Map<string, boolean>();

/**
 * Refine data-provider tailored to API Platform 4 with Hydra/JSON-LD output.
 *
 * Worktide collections return:
 *   {
 *     "@context": "...",
 *     "@id": "/v1/projects",
 *     "@type": "Collection",
 *     "totalItems": 218,
 *     "member": [ {...}, {...} ],
 *     "search": { ... }
 *   }
 *
 * `member` (singular) replaces the older `hydra:member` after API Platform's
 * 4.x JSON-LD output cleanup. We handle both shapes here to be defensive —
 * the platform sometimes emits the namespaced form on older endpoints.
 *
 * Filters are translated 1:1 to API Platform's filter syntax:
 *   { field: "name", operator: "contains", value: "foo" }  → ?name=foo
 *   { field: "isActive", operator: "eq", value: true }     → ?isActive=true
 *   { field: "deletedAt", operator: "null", value: false } → ?exists[deletedAt]=true
 *
 * For UUID FK columns: API Platform's SearchFilter takes EITHER the bare uuid
 * or the IRI `/v1/projects/<uuid>`. We pass the value through unchanged —
 * the caller decides the shape.
 *
 * The data-provider's `resource` argument is the IRI-segment after `/v1/`
 * — `"projects"`, `"customer_systems"`, `"role_permission_overrides"`. All
 * lowercase-underscore, matching API Platform's default URI template.
 */
export const dataProvider: DataProvider = {
  getApiUrl() {
    return API_BASE;
  },

  async getList({ resource, pagination, sorters, filters }) {
    // Sorters + filters are shared by both the single-page and fetch-all paths.
    const base: Record<string, unknown> = {};

    sorters?.forEach((s) => {
      base[`order[${s.field}]`] = s.order;
    });

    filters?.forEach((f) => {
      if (!('field' in f) || f.value == null) return;
      const field = f.field;
      switch (f.operator) {
        case 'eq':
        case 'contains':
          base[field] = f.value;
          break;
        case 'gte':
          base[`${field}[after]`] = f.value;
          break;
        case 'lte':
          base[`${field}[before]`] = f.value;
          break;
        case 'null':
          base[`exists[${field}]`] = !f.value;
          break;
        case 'nnull':
          base[`exists[${field}]`] = !!f.value;
          break;
        default:
          base[field] = f.value;
      }
    });

    const readPage = async (params: Record<string, unknown>) => {
      const { data } = await api.get(`/${resource}`, { params });
      const members = (data.member ?? data['hydra:member'] ?? []) as unknown[];
      const total = (data.totalItems ?? data['hydra:totalItems'] ?? members.length) as number;
      return { members, total };
    };

    // `pagination.mode: 'off'` means "give me the whole collection". API Platform
    // still applies a default page size, so a single param-less request silently
    // returns only the first page (~30). Fetch page 1, learn the total, then pull
    // the remaining pages IN PARALLEL — turns N sequential round-trips into one
    // (subject to the browser's per-host connection cap). Bounded by a hard cap.
    if (pagination?.mode === 'off') {
      const PAGE_SIZE = 200; // the API's per-page maximum (pagination_maximum_items_per_page)
      const HARD_CAP = 5000; // safety valve against unbounded collections

      const first = await readPage({ ...base, page: 1, itemsPerPage: PAGE_SIZE });
      const total = first.total;
      // The API may cap the page below what we asked; trust what it actually
      // returned so the page maths stay correct regardless of the server cap.
      const step = first.members.length || PAGE_SIZE;
      const all: unknown[] = [...first.members];

      if (step > 0 && total > step) {
        const lastPage = Math.min(Math.ceil(total / step), Math.ceil(HARD_CAP / step));
        const rest = await Promise.all(
          Array.from({ length: lastPage - 1 }, (_, i) =>
            readPage({ ...base, page: i + 2, itemsPerPage: PAGE_SIZE }),
          ),
        );
        for (const r of rest) all.push(...r.members);
      }

      return { data: all.slice(0, HARD_CAP) as never, total };
    }

    const { members, total } = await readPage({
      ...base,
      page: pagination?.currentPage ?? 1,
      itemsPerPage: pagination?.pageSize ?? 25,
    });
    return { data: members as never, total };
  },

  async getOne({ resource, id }) {
    const { data } = await api.get(`/${resource}/${id}`);
    return { data };
  },

  async getMany({ resource, ids }) {
    const idStrs = ids.map(String);
    const perId = async () => {
      const result = await Promise.all(idStrs.map((id) => api.get(`/${resource}/${id}`).then((r) => r.data)));
      return { data: result as never };
    };

    // A single id, or a resource we know can't batch → straight to per-id.
    if (idStrs.length <= 1 || idBatchable.get(resource) === false) {
      return perId();
    }

    // Probe/serve a single batched request: GET /resource?id[]=a&id[]=b …
    try {
      const search = new URLSearchParams();
      for (const id of idStrs) search.append('id[]', id);
      search.set('itemsPerPage', String(idStrs.length));
      const { data } = await api.get(`/${resource}?${search.toString()}`);
      const members = (data.member ?? data['hydra:member'] ?? []) as Array<{ '@id'?: string; id?: string }>;
      const requested = new Set(idStrs);
      const idOf = (m: { '@id'?: string; id?: string }) => m['@id']?.split('/').pop() ?? m.id ?? '';
      // Filter is live iff every returned row was actually requested (and the
      // server honoured the page size). Otherwise the param was ignored.
      const batched =
        members.length > 0 && members.length <= idStrs.length && members.every((m) => requested.has(idOf(m)));
      if (batched) {
        idBatchable.set(resource, true);
        return { data: members as never };
      }
      idBatchable.set(resource, false);
      return perId();
    } catch {
      idBatchable.set(resource, false);
      return perId();
    }
  },

  async create({ resource, variables }) {
    const { data } = await api.post(`/${resource}`, variables);
    return { data };
  },

  async update({ resource, id, variables }) {
    const { data } = await api.patch(`/${resource}/${id}`, variables, {
      // API Platform requires this content-type for PATCH semantics
      headers: { 'Content-Type': 'application/merge-patch+json' },
    });
    return { data };
  },

  async deleteOne({ resource, id }) {
    const { data } = await api.delete(`/${resource}/${id}`);
    return { data };
  },

  async custom({ url, method, payload, query, headers }) {
    const config = {
      method,
      url,
      data: payload,
      params: query,
      headers,
    };
    const { data } = await api.request(config);
    return { data };
  },
};
