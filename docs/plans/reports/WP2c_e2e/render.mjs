// Render the real authenticated page without a listener. No application components are mocked.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { realpathSync, writeFileSync } from "node:fs";

assert.ok(process.env.DATABASE_PATH && realpathSync(dirname(process.env.DATABASE_PATH)).includes("/opc-wp2c-e2e-"));
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
const directory = resolve("docs/plans/reports/WP2c_e2e");
const request = new Request(`http://127.0.0.1:31404/essays/${id}`, { headers: { cookie: `wm_session=${"c".repeat(64)}` } });
try {
  const page = await inRequest(request, () => EssayPage({ params: Promise.resolve({ id }) }));
  assert.equal(page.type, SessionView);
  assert.equal(SessionView(page.props).type, SessionProvider, "must enter the original editing/feedback controller");
  const unexpectedNavigation = () => assert.fail("static render must not navigate");
  const router = { back: unexpectedNavigation, forward: unexpectedNavigation, refresh: unexpectedNavigation, push: unexpectedNavigation, replace: unexpectedNavigation, prefetch: unexpectedNavigation };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(TooltipProvider, {}, page)));
  assert.ok(!html.includes("练习内容 · 只读")); assert.ok(!html.includes("当前版本暂不支持编辑"));
  assert.ok(html.includes('id="main-content"')); assert.ok(html.includes('aria-label="检查面板"'));
  let href = null;
  if (label !== "writing") {
    href = process.env.QUESTION_BANK_ENABLED === "true" && page.props.session.question ? `/topics/${page.props.session.question.primaryTopic}` : "/";
    assert.ok(html.includes(`href="${href}">下一步`), "expected deterministic next link");
    assert.ok(!html.includes("生成学习计划"));
  }
  writeFileSync(join(directory, `${label}.html`), html + "\n");
  writeFileSync(join(directory, `${label}-render.json`), JSON.stringify({ path: `/essays/${id}`, authenticated: true, renderer: "EssayPage -> SessionView -> SessionProvider -> EssayScreen; real React SSR", nextHref: href, lastStudentActionAt: page.props.session.lastStudentActionAt, stage: page.props.session.stage, lifecycle: page.props.session.lifecycle, byteLength: Buffer.byteLength(html) }, null, 2) + "\n");
  console.log(`PASS authenticated page ${label}, next=${href}; ${label}.html`);
} finally { getDb().$client.close(); }
