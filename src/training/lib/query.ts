import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/training/lib/api";
import { errorMessage } from "@/training/lib/auth";

/**
 * GET an API path with caching. The query key is the path itself, so invalidating
 * a prefix (e.g. "/admin/intakes") refreshes every screen that shows intakes.
 */
export function useApi<T>(path: string | null, opts: { refetchInterval?: number } = {}) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api.get<T>(path!),
    enabled: path !== null,
    refetchInterval: opts.refetchInterval,
  });
}

type MutationOpts<T> = {
  /** Paths (or prefixes) whose cached data should be refetched afterwards. */
  invalidate?: string[];
  success?: string | ((data: T) => string);
  onSuccess?: (data: T) => void;
};

/** A write that shows a toast on success or failure and refreshes related data. */
export function useApiMutation<T = unknown, V = void>(fn: (vars: V) => Promise<T>, opts: MutationOpts<T> = {}) {
  const qc = useQueryClient();
  return useMutation<T, Error, V>({
    mutationFn: fn,
    onSuccess: (data) => {
      for (const prefix of opts.invalidate ?? []) {
        qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith(prefix) });
      }
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(data) : opts.success);
      opts.onSuccess?.(data);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Builds "/path?a=1&b=2", skipping empty values. */
export function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export type { QueryKey };
