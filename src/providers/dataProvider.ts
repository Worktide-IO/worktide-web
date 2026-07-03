import type { DataProvider } from '@refinedev/core';
import { api, API_BASE } from '@/lib/api';

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
    // still applies a default page size (and caps itemsPerPage), so a single
    // param-less request silently returns only the first page (~30). Page through
    // to the end instead — bounded by a hard cap so a runaway can't hang the UI.
    if (pagination?.mode === 'off') {
      const PAGE_SIZE = 100; // stay under the API's per-page cap (200)
      const HARD_CAP = 5000; // safety valve against unbounded collections
      const all: unknown[] = [];
      let page = 1;
      let total: number | undefined;
      for (;;) {
        const { members, total: t } = await readPage({ ...base, page, itemsPerPage: PAGE_SIZE });
        total = t;
        all.push(...members);
        if (members.length < PAGE_SIZE || all.length >= (total ?? 0) || all.length >= HARD_CAP) break;
        page += 1;
      }
      return { data: all as never, total: total ?? all.length };
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
    const result = await Promise.all(ids.map((id) => api.get(`/${resource}/${id}`).then((r) => r.data)));
    return { data: result as never };
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
