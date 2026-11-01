// Use Next's request stores so route tests exercise real Cookie authentication,
// without opening a network listener or replacing application auth functions.
import "next/dist/server/node-environment";
import { registerHooks } from "node:module";
import { NextRequest } from "next/server";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { workUnitAsyncStorage } from "next/dist/server/app-render/work-unit-async-storage.external";
import { createWorkStore } from "next/dist/server/async-storage/work-store";
import { createRequestStoreForAPI } from "next/dist/server/async-storage/request-store";

// Next's bundler normally applies this server alias; node --test does not.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "next/navigation" ? "next/dist/api/navigation.react-server.js" : specifier, context);
} });

export function inRequest<T>(request: Request, run: () => T): T {
  const nextRequest = new NextRequest(request.url, { headers: request.headers });
  const store = createRequestStoreForAPI(nextRequest, new URL(request.url), { tags: [], expirationsByCacheKind: new Map() }, undefined, undefined, undefined);
  const work = createWorkStore({ page: "/api/sessions/[id]/route", buildId: "test", deploymentId: "test", previouslyRevalidatedTags: [], renderOpts: {
    cacheLifeProfiles: { default: { stale: 0, revalidate: 0, expire: 0 } }, staticPageGenerationTimeout: 60, cacheComponents: false, validationLevel: "warning",
    experimental: { authInterrupts: false, useCacheTimeout: 60, durableUseCacheEntries: false },
    waitUntil: undefined, onClose: () => {}, onAfterTaskError: undefined,
  } });
  return workAsyncStorage.run(work, () => workUnitAsyncStorage.run(store, run));
}
