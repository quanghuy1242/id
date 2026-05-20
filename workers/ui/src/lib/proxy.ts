export async function proxyToCore(request: Request, env: { CORE_ID: Fetcher }): Promise<Response> {
  const url = new URL(request.url);
  url.hostname = "core-id.local";
  url.protocol = "https:";

  const coreRequest = new Request(url.toString(), {
    method: request.method,
    headers: request.headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.clone().arrayBuffer(),
  });

  return env.CORE_ID.fetch(coreRequest);
}
