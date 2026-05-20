export const runtime = "edge";

import { env } from "cloudflare:workers";

export async function GET() {
  try {
    const bindEnv = env as { CORE_ID: Fetcher };
    const response = await bindEnv.CORE_ID.fetch("https://core-id.local/health");
    return Response.json({ coreReachable: response.ok });
  } catch {
    return Response.json({ coreReachable: false }, { status: 500 });
  }
}
