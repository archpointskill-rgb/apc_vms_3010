import { supabase } from "./lib/supabase";

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "";

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: any) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;

  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const isJson = (res.headers.get("content-type") ?? "").includes("json");
  const payload = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError((payload && payload.error) || "That did not work.", res.status, payload);
  return payload as T;
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T,>(path: string, body: unknown) => request<T>("PATCH", path, body),
  put: <T,>(path: string, body: unknown) => request<T>("PUT", path, body),
  del: <T,>(path: string) => request<T>("DELETE", path)
};

/** Downloads a file from the API with the sign-in attached. */
export async function download(path: string, filename: string): Promise<void> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const res = await fetch(`${BASE}/api${path}`, {
    headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? "The download failed.", res.status, body);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
