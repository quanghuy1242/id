import { defaultWorkerCache, matchWorkerCache, putWorkerCache } from "./worker-cache";
import type { AuthRuntimeOptions } from "../types";
import { authPluginConfig } from "../config";
import { JWKS_CACHE_MAX_AGE_SECONDS } from "../../shared/constants";
import { HTTP_OK } from "../../shared/http-status";

const jwksCacheControl = `public, max-age=${JWKS_CACHE_MAX_AGE_SECONDS}`;

/** True for the public Better Auth JWKS endpoint mounted by this Worker. */
export function authPathIsJwks(pathname: string): boolean {
  return pathname === `${authPluginConfig.issuerPath}${authPluginConfig.jwksPath}`;
}

function jwksCacheKey(request: Request): Request {
  const url = new URL(request.url);
  url.search = "";
  return new Request(url, { method: "GET" });
}

function isCacheableJwksResponse(response: Response): boolean {
  return response.status === HTTP_OK && !response.headers.has("set-cookie");
}

/** Cache public JWKS responses; misses/errors fall through to loadResponse. */
export async function withJwksCache(
  request: Request,
  runtime: AuthRuntimeOptions,
  loadResponse: () => Promise<Response>,
): Promise<Response> {
  const cache = defaultWorkerCache();
  const key = jwksCacheKey(request);
  const cached = cache ? await matchWorkerCache(cache, key) : undefined;
  if (cached) {
    return cached;
  }

  const response = await loadResponse();
  if (!cache || !isCacheableJwksResponse(response)) {
    return response;
  }

  const cacheable = new Response(response.body, response);
  cacheable.headers.set("cache-control", jwksCacheControl);
  const clientResponse = cacheable.clone();
  await putWorkerCache(cache, key, cacheable, runtime.backgroundTaskRunner);
  return clientResponse;
}
