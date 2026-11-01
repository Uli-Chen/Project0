// Render the real authenticated page without a listener. No application components are mocked.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { realpathSync, writeFileSync } from "node:fs";

assert.ok(process.env.DATABASE_PATH && realpathSync(dirname(process.env.DATABASE_PATH)).includes("/opc-quick-"));
assert.equal(process.env.LLM_API_KEY, "");
// Next's bundler uses server-only's empty entry on the server. The default React
// condition is necessary to SSR the client components in this standalone process.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "server-only" ? resolve("node_modules/server-only/empty.js") : specifier, context);
} });
const { inRequest } = await import("../../../../tests/helpers/request-context.ts");
// The route helper uses the RSC navigation entry; SSR needs the real client entry
// too (useRouter). It also exports the real notFound/redirect functions.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier === "next/navigation" ? "next/dist/client/components/navigation.js" : specifier, context);
} });
const { createElement } = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const { AppRouterContext } = await import("next/dist/shared/lib/app-router-context.shared-runtime.js");
const { default: EssayPage } = await import("../../../../app/essays/[id]/page.tsx");
const { SessionView } = await import("../../../../components/essay/session-view.tsx");
const { SessionProvider } = await import("../../../../lib/prototype/session-store.tsx");
const { TooltipProvider } = await import("../../../../components/ui/tooltip.tsx");
const { getDb } = await import("../../../../lib/db/client.ts");

globalThis.fetch = async () => { throw new Error("Network disabled in page renderer"); };
const [id, label] = process.argv.slice(2);
const directory = resolve("docs/plans/reports/WP4a_e2e");
const request = new Request(`http://quick.test/essays/${id}`, { headers: { cookie: `wm_session=${"a".repeat(64)}` } });
try {
  const page = await inRequest(request, () => EssayPage({ params: Promise.resolve({ id }) }));
  assert.equal(page.type, SessionView);
  if (!label.startsWith("quick")) assert.equal(SessionView(page.props).type, SessionProvider, "Deep uses the real editing controller");
  const unexpectedNavigation = () => assert.fail("static render must not navigate");
  const router = { back: unexpectedNavigation, forward: unexpectedNavigation, refresh: unexpectedNavigation, push: unexpectedNavigation, replace: unexpectedNavigation, prefetch: unexpectedNavigation };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(TooltipProvider, {}, page)));
  if (label.startsWith("quick")) {
    assert.ok(html.includes("练习内容 · 只读")); assert.ok(html.includes("后来修改的源卡片"));
    assert.ok(!/<button|<textarea|<input|contenteditable/.test(html));
  } else {
    const aside = html.match(/<aside aria-label="提纲"[\s\S]*?<\/aside>/)?.[0];
    assert.ok(aside?.includes("主题卡片快照")); assert.ok(aside.includes("最初保存的原因"));
    assert.ok(aside.includes("回答里的原话")); assert.ok(!aside.includes("后来修改的源卡片"));
  }
  writeFileSync(join(directory, `${label}.html`), html + "\n");
  writeFileSync(join(directory, `${label}-render.json`), JSON.stringify({ path: `/essays/${id}`, authenticated: true, renderer: label.startsWith("quick") ? "EssayPage -> SessionView -> ReadonlySession; real React SSR" : "EssayPage -> SessionView -> SessionProvider -> EssayScreen; real React SSR", lastStudentActionAt: page.props.session.lastStudentActionAt, stage: page.props.session.stage, lifecycle: page.props.session.lifecycle, byteLength: Buffer.byteLength(html) }, null, 2) + "\n");
  console.log(`PASS authenticated page ${label}, ${label}.html`);
} finally { getDb().$client.close(); }
