export const runtime = "edge";

import { env } from "cloudflare:workers";
import { proxyToCore } from "@/lib/proxy";

async function handle(request: Request): Promise<Response> {
  return proxyToCore(request, env as { CORE_ID: Fetcher });
}

export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
export async function PUT(request: Request) { return handle(request); }
export async function PATCH(request: Request) { return handle(request); }
export async function DELETE(request: Request) { return handle(request); }
