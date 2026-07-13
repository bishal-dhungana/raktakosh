export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Hosted builds use the Render API by default. VITE_API_BASE_URL remains the
 * deployment override, while local development intentionally keeps relative
 * requests so the Vite development proxy can be used when configured.
 */
const deployedApiUrl = "https://raktakoshv1.onrender.com";
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.PROD ? deployedApiUrl : "")).replace(/\/$/, "");
let csrfToken = "";

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD", "OPTIONS"].includes((init.method ?? "GET").toUpperCase()) && csrfToken) {
    headers.set("X-RK-CSRF", csrfToken);
  }
  const response = await fetch(`${apiBaseUrl}${url}`, { ...init, headers, credentials: "include" });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "The request could not be completed.";
    throw new ApiError(message, response.status);
  }
  if (payload && typeof payload === "object" && "csrfToken" in payload && typeof payload.csrfToken === "string") {
    csrfToken = payload.csrfToken;
  }
  return payload as T;
}

export function toQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}
