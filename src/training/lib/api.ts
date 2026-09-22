// Client for the Training Center API (the Supabase Edge Function "training").
// Requests carry the signed-in Isoko account's access token; the API decides
// what that account may see. Public pages work without signing in.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const BASE = (
  import.meta.env.VITE_TRAINING_API_URL ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/training`
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  const headers = await authHeaders();
  const init: RequestInit = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "network");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status, json?.error?.code);
  }
  return json?.data as T;
}

export const api = {
  get: <T = unknown>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  put: <T = unknown>(path: string, body?: Body) => request<T>("PUT", path, body ?? {}),
  patch: <T = unknown>(path: string, body?: Body) => request<T>("PATCH", path, body ?? {}),
  delete: <T = unknown>(path: string) => request<T>("DELETE", path),

  /** Multipart upload with progress (fetch can't report upload progress). */
  async upload<T = unknown>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
    const headers = await authHeaders();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${BASE}${path}`);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let json: { data?: T; error?: { message?: string; code?: string } } | null = null;
        try {
          json = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON error page */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(json?.data as T);
        else reject(new ApiError(json?.error?.message ?? `Upload failed (${xhr.status})`, xhr.status, json?.error?.code));
      };
      xhr.onerror = () => reject(new ApiError("Upload failed. Check your connection and try again.", 0, "network"));
      xhr.send(form);
    });
  },

  /** Fetches a file the user is allowed to see (PDFs, photos, documents) as a blob. */
  async blob(path: string): Promise<Blob> {
    const res = await fetch(`${BASE}${path}`, { headers: await authHeaders() }).catch(() => null);
    if (!res) throw new ApiError("Can't reach the server. Check your connection and try again.", 0, "network");
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      throw new ApiError(json?.error?.message ?? `Request failed (${res.status})`, res.status);
    }
    return res.blob();
  },
};

/**
 * Opens an API-served file in a new tab. The tab is opened straight away (so
 * popup blockers allow it) and shows the file once it has downloaded.
 */
export async function openApiFile(path: string) {
  const tab = window.open("", "_blank");
  try {
    const url = URL.createObjectURL(await api.blob(path));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    toast.error(err instanceof Error ? err.message : "Could not open the file");
  }
}

/** Object URL for an API-served image (the request needs the access token), or null while loading. */
export function useApiObjectUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return setUrl(null);
    let objectUrl: string | null = null;
    let cancelled = false;
    api
      .blob(path)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return url;
}

/** Downloads an API-served file under the given name. */
export async function downloadApiFile(path: string, filename: string) {
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
