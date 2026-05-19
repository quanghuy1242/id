const requiredEnv = ["ID_CORE_URL", "ID_UI_URL"];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

const coreUrl = new URL(process.env.ID_CORE_URL);
const uiUrl = new URL(process.env.ID_UI_URL);

async function expectOk(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Smoke check failed: ${url} returned ${response.status}`);
  }
}

await expectOk(new URL("/health", coreUrl));
await expectOk(new URL("/api/auth/jwks", coreUrl));
await expectOk(new URL("/.well-known/oauth-authorization-server/api/auth", coreUrl));
await expectOk(new URL("/admin", uiUrl));

console.log("remote smoke checks passed");

