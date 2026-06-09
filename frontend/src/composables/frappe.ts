/**
 * Vue composables that mirror the `frappe-react-sdk` hooks used across the
 * Butler app, implemented on top of `frappe-ui` resources. This keeps page
 * code almost identical to the original React version while running on Vue.
 *
 * React (frappe-react-sdk)            Vue (this module)
 * --------------------------------    --------------------------------
 * useFrappeGetDocList(dt, args)       useFrappeGetDocList(dt, args)
 * useFrappeGetDoc(dt, name)           useFrappeGetDoc(dt, name)
 * useFrappeCreateDoc()                useFrappeCreateDoc()
 * useFrappeUpdateDoc()                useFrappeUpdateDoc()
 * useFrappeDeleteDoc()                useFrappeDeleteDoc()
 * useFrappePostCall(method)           useFrappePostCall(method)
 */
import { createResource } from "@frappeui/resources";
import {
  computed,
  ref,
  toValue,
  watch,
  type ComputedRef,
  type MaybeRefOrGetter,
  type Ref,
} from "vue";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Filter = (string | number)[];

export interface GetDocListArgs {
  fields?: string[];
  filters?: Filter[] | Record<string, unknown>;
  orFilters?: Filter[] | Record<string, unknown>;
  orderBy?: { field: string; order?: "asc" | "desc" };
  limit?: number;
  limit_start?: number;
  groupBy?: string;
}

export interface QueryResult<T> {
  data: ComputedRef<T | undefined>;
  error: ComputedRef<unknown>;
  isLoading: ComputedRef<boolean>;
  isValidating: ComputedRef<boolean>;
  mutate: () => Promise<unknown> | void;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/**
 * Fetch a list of documents — equivalent to `frappe.client.get_list`.
 * `args` may be a plain object, a ref, or a getter so that filters can be
 * reactive (the list reloads automatically when they change).
 *
 * Passing (or resolving to) `null` disables fetching — the Vue equivalent of
 * the `null` SWR key used in the React version for conditional queries.
 */
export function useFrappeGetDocList<T = Record<string, unknown>>(
  doctype: string,
  args?: MaybeRefOrGetter<GetDocListArgs | null | undefined>,
): QueryResult<T[]> {
  const enabled = () => toValue(args) !== null;

  const resource = createResource({
    url: "frappe.client.get_list",
    makeParams() {
      const a = (toValue(args) ?? {}) as GetDocListArgs;
      return {
        doctype,
        fields: a.fields ?? ["name"],
        filters: a.filters,
        or_filters: a.orFilters,
        order_by: a.orderBy
          ? `${a.orderBy.field} ${a.orderBy.order ?? "desc"}`
          : undefined,
        limit_start: a.limit_start ?? 0,
        limit_page_length: a.limit ?? 0,
        group_by: a.groupBy,
      };
    },
    auto: false,
  });

  function refresh() {
    if (enabled()) resource.reload();
  }

  watch(() => toValue(args), refresh, { deep: true, immediate: true });

  return {
    data: computed(() =>
      enabled() ? (resource.data as T[] | undefined) : undefined,
    ),
    error: computed(() => resource.error),
    isLoading: computed(() => enabled() && resource.loading),
    isValidating: computed(() => enabled() && resource.loading),
    mutate: () => resource.reload(),
  };
}

/**
 * Fetch a single document — equivalent to `frappe.client.get`.
 * `name` may be reactive; the doc reloads when it changes and is skipped
 * while the name is empty.
 */
export function useFrappeGetDoc<T = Record<string, unknown>>(
  doctype: string,
  name?: MaybeRefOrGetter<string | undefined>,
): QueryResult<T> {
  const resource = createResource({
    url: "frappe.client.get",
    makeParams() {
      return { doctype, name: toValue(name) };
    },
    auto: false,
  });

  watch(
    () => toValue(name),
    (value) => {
      if (value) resource.reload();
    },
    { immediate: true },
  );

  return {
    data: computed(() => resource.data as T | undefined),
    error: computed(() => resource.error),
    isLoading: computed(() => resource.loading),
    isValidating: computed(() => resource.loading),
    mutate: () => resource.reload(),
  };
}

/* ------------------------------------------------------------------ */
/* Mutations                                                           */
/* ------------------------------------------------------------------ */

interface MutationState {
  loading: Ref<boolean>;
  error: Ref<unknown>;
  isCompleted: Ref<boolean>;
  reset: () => void;
}

function createMutationState(): MutationState {
  const loading = ref(false);
  const error = ref<unknown>(null);
  const isCompleted = ref(false);
  return {
    loading,
    error,
    isCompleted,
    reset: () => {
      loading.value = false;
      error.value = null;
      isCompleted.value = false;
    },
  };
}

async function runMutation<T>(
  state: MutationState,
  url: string,
  params: Record<string, unknown>,
): Promise<T> {
  state.loading.value = true;
  state.error.value = null;
  state.isCompleted.value = false;
  const resource = createResource({ url });
  try {
    const result = (await resource.submit(params)) as T;
    state.isCompleted.value = true;
    return result;
  } catch (e) {
    state.error.value = e;
    throw e;
  } finally {
    state.loading.value = false;
  }
}

/** Create a document — equivalent to `frappe.client.insert`. */
export function useFrappeCreateDoc<T = Record<string, unknown>>() {
  const state = createMutationState();
  const createDoc = (doctype: string, doc: Record<string, unknown>) =>
    runMutation<T>(state, "frappe.client.insert", {
      doc: { doctype, ...doc },
    });
  return { createDoc, ...state };
}

/** Update a document — equivalent to `frappe.client.set_value`. */
export function useFrappeUpdateDoc<T = Record<string, unknown>>() {
  const state = createMutationState();
  const updateDoc = (
    doctype: string,
    name: string,
    doc: Record<string, unknown>,
  ) =>
    runMutation<T>(state, "frappe.client.set_value", {
      doctype,
      name,
      fieldname: doc,
    });
  return { updateDoc, ...state };
}

/** Delete a document — equivalent to `frappe.client.delete`. */
export function useFrappeDeleteDoc() {
  const state = createMutationState();
  const deleteDoc = (doctype: string, name: string) =>
    runMutation(state, "frappe.client.delete", { doctype, name });
  return { deleteDoc, ...state };
}

/** Call a whitelisted method (POST) — equivalent to `useFrappePostCall`. */
export function useFrappePostCall<T = Record<string, unknown>>(method: string) {
  const state = createMutationState();
  const result = ref<T | null>(null);
  const call = async (params: Record<string, unknown> = {}) => {
    const data = await runMutation<T>(state, method, params);
    result.value = data;
    return data;
  };
  return { call, result, ...state };
}
