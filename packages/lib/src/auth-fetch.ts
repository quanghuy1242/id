export async function postAuthApi(path: string, body: Record<string, unknown>, extraHeaders?: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}
