// src/lib/api.ts
export async function apiGet<T>(url: string, headers?: Record<string, string>): Promise<T> {
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()) as T;
}

export async function apiPost<T>(url: string, body: any): Promise<T> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()) as T;
}
