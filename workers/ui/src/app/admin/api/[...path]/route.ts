export const runtime = "edge";

import { env } from "cloudflare:workers";

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const resolvedParams = await params;
  const pathParts = resolvedParams.path || [];
  const subPath = pathParts.join("/");
  
  const requestUrl = new URL(request.url);
  const targetUrl = new URL(`https://core-id.local/api/admin/${subPath}${requestUrl.search}`);

  const bindEnv = env as { CORE_ID: Fetcher };
  const coreRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.clone().arrayBuffer(),
  });

  return bindEnv.CORE_ID.fetch(coreRequest);
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) { return handle(request, context); }
export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) { return handle(request, context); }
export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) { return handle(request, context); }
export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) { return handle(request, context); }
export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) { return handle(request, context); }
