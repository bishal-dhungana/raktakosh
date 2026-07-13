export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "ApiError";
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function api<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiBaseUrl}${url}`, { ...init, headers, credentials: "include" });
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : null;
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : "The request could not be completed.";
    throw new ApiError(message, response.status);
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
