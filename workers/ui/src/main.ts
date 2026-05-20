import { Hono } from "hono";
import { ADMIN_API_PROXY_PREFIX, CORE_HEALTH_PATH } from "@id/lib";
import type { UiEnv } from "@/lib/env";

const app = new Hono<{ Bindings: UiEnv }>();

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function authPage(title: string, body: string): Response {
  return new Response(
    [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${escapeHtml(title)}</title>`,
      "<style>",
      ":root{color-scheme:light dark;font-family:Inter,system-ui,sans-serif}",
      "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f7f4;color:#1b1c1f}",
      "main{width:min(420px,calc(100vw - 32px));display:grid;gap:18px}",
      "form{display:grid;gap:12px}",
      "label{display:grid;gap:6px;font-size:14px}",
      "input{font:inherit;padding:10px 12px;border:1px solid #b8bbb2;border-radius:6px;background:white;color:#1b1c1f}",
      "button{font:inherit;padding:10px 12px;border:0;border-radius:6px;background:#155eef;color:white;cursor:pointer}",
      "button.secondary{background:#4b5563}",
      "p{margin:0;line-height:1.5}",
      ".error{color:#b42318}",
      "@media (prefers-color-scheme:dark){body{background:#181a1d;color:#f5f5f2}input{background:#111317;color:#f5f5f2;border-color:#4b5563}}",
      "</style>",
      "</head>",
      "<body>",
      `<main>${body}</main>`,
      "</body>",
      "</html>",
    ].join(""),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

async function fetchCoreHealth(env: UiEnv) {
  return env.CORE_ID.fetch(`https://core-id.local${CORE_HEALTH_PATH}`);
}

app.get("/health", async (c) => {
  const response = await fetchCoreHealth(c.env);
  return c.json({ coreReachable: response.ok });
});

app.get("/admin", async (c) => {
  const response = await fetchCoreHealth(c.env);
  return c.json({ admin: "id-ui", coreReachable: response.ok });
});

app.get("/admin/login", (c) => {
  const oauthQuery = new URL(c.req.url).searchParams.toString();
  return authPage(
    "Sign in",
    [
      "<h1>Sign in</h1>",
      '<p id="error" class="error"></p>',
      '<form id="login-form">',
      `<input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}">`,
      '<label>Email<input name="email" type="email" autocomplete="username" required></label>',
      '<label>Password<input name="password" type="password" autocomplete="current-password" required></label>',
      "<button>Sign in</button>",
      "</form>",
      "<script>",
      "const form=document.querySelector('#login-form');",
      "const error=document.querySelector('#error');",
      "form.addEventListener('submit',async(event)=>{",
      "event.preventDefault();error.textContent='';",
      "const data=Object.fromEntries(new FormData(form));",
      "const response=await fetch('/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(data)});",
      "const body=await response.json().catch(()=>({}));",
      "if(response.ok&&body.redirect){location.href=body.url||body.redirectURL||'/';return;}",
      "if(response.ok&&body.url){location.href=body.url;return;}",
      "error.textContent=body.message||body.error||'Sign in failed';",
      "});",
      "</script>",
    ].join(""),
  );
});

app.get("/admin/consent", (c) => {
  const search = new URL(c.req.url).searchParams;
  const oauthQuery = search.toString();
  const clientName = search.get("client_name") ?? search.get("client_id") ?? "this application";
  const scope = search.get("scope") ?? "";
  return authPage(
    "Authorize application",
    [
      "<h1>Authorize application</h1>",
      `<p>${escapeHtml(clientName)} is requesting access.</p>`,
      `<p>${escapeHtml(scope || "No scopes requested")}</p>`,
      '<p id="error" class="error"></p>',
      '<form id="consent-form">',
      `<input type="hidden" name="oauth_query" value="${escapeHtml(oauthQuery)}">`,
      "<button name=\"accept\" value=\"true\">Allow</button>",
      '<button class="secondary" name="accept" value="false">Deny</button>',
      "</form>",
      "<script>",
      "const form=document.querySelector('#consent-form');",
      "const error=document.querySelector('#error');",
      "form.addEventListener('submit',async(event)=>{",
      "event.preventDefault();error.textContent='';",
      "const submitter=event.submitter;",
      "const formData=new FormData(form);",
      "const response=await fetch('/api/auth/oauth2/consent',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({accept:submitter?.value==='true',oauth_query:formData.get('oauth_query')})});",
      "const body=await response.json().catch(()=>({}));",
      "if(response.ok&&body.redirect_uri){location.href=body.redirect_uri;return;}",
      "error.textContent=body.message||body.error||'Consent failed';",
      "});",
      "</script>",
    ].join(""),
  );
});

app.all("/api/auth/*", async (c) => {
  const url = new URL(c.req.url);
  url.hostname = "core-id.local";
  url.protocol = "https:";
  return c.env.CORE_ID.fetch(new Request(url, c.req.raw));
});

app.all(`${ADMIN_API_PROXY_PREFIX}/*`, async (c) => {
  const url = new URL(c.req.url);
  const corePath = url.pathname.slice(ADMIN_API_PROXY_PREFIX.length);
  url.hostname = "core-id.local";
  url.protocol = "https:";
  url.pathname = `/api/admin${corePath}`;
  return c.env.CORE_ID.fetch(new Request(url, c.req.raw));
});

export default app;
