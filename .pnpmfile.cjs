"use strict";

// Local inner-loop link for the shared @idco/* design system.
//
// The committed dependency graph always points at the published GitHub
// Packages artifacts (`@idco/ui` -> npm:@quanghuy1242/idco-ui, etc.), so CI and
// fresh clones resolve from the registry with no local-path assumptions.
//
// When a developer is co-editing the sibling ~/pjs/idco checkout, they opt into
// a live link by running `pnpm dev:link` (which sets IDCO_LINK=1). This hook
// then rewrites the @idco/* dependency keys to `link:` against the sibling so
// edits show up without publishing. It is a no-op unless IDCO_LINK=1, so it
// never affects CI, deploys, or a default `pnpm install`.
//
// Important: never commit a lockfile produced in linked mode. CI runs
// `--frozen-lockfile` and `pnpm check:lockfile` guards against a link-shaped
// lockfile reaching the pipeline.

const path = require("node:path");

// ~/pjs/auth and ~/pjs/idco are siblings.
const IDCO_ROOT = path.resolve(__dirname, "..", "idco");

const LINKS = {
  "@idco/ui": path.join(IDCO_ROOT, "packages", "ui"),
  "@idco/lib": path.join(IDCO_ROOT, "packages", "lib"),
};

function readPackage(pkg) {
  if (process.env.IDCO_LINK !== "1") return pkg;
  for (const [name, target] of Object.entries(LINKS)) {
    if (pkg.dependencies && pkg.dependencies[name]) {
      pkg.dependencies[name] = `link:${target}`;
    }
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
