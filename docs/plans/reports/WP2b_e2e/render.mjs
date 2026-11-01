// Render the real authenticated page without a listener. No application components are mocked.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { dirname, join, resolve } from "node:path";
import { realpathSync, writeFileSync } from "node:fs";

assert.ok(process.env.DATABASE_PATH && realpathSync(dirname(process.env.DATABASE_PATH)).startsWith("/private/tmp/opc-wp2b-e2e."));
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
const directory = resolve("docs/plans/reports/WP2b_e2e");
const request = new Request(`http://127.0.0.1:31404/essays/${id}`, { headers: { cookie: `wm_session=${"e".repeat(64)}` } });
try {
  const page = await inRequest(request, () => EssayPage({ params: Promise.resolve({ id }) }));
  assert.equal(page.type, SessionView);
  assert.equal(SessionView(page.props).type, SessionProvider, "must enter the original editing/feedback controller");
  const unexpectedNavigation = () => assert.fail("static render must not navigate");
  const router = { back: unexpectedNavigation, forward: unexpectedNavigation, refresh: unexpectedNavigation, push: unexpectedNavigation, replace: unexpectedNavigation, prefetch: unexpectedNavigation };
  const html = renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, createElement(TooltipProvider, {}, page)));
  assert.ok(!html.includes("练习内容 · 只读")); assert.ok(!html.includes("当前版本暂不支持编辑"));
  assert.ok(html.includes('id="main-content"')); assert.ok(html.includes('aria-label="检查面板"'));
  assert.ok(html.includes("练习成绩")); assert.ok(html.includes("展开例子")); assert.ok(html.includes("6.0"));
  const failed = label.startsWith("review-failed");
  assert.equal(html.includes("提纲回顾失败，评分与问题反馈已保存。"), failed);
  assert.equal(/<button\b[^>]*>重试<\/button>/.test(html), failed);
  if (label === "legacy") assert.equal(page.props.session.completedAt, null);
  writeFileSync(join(directory, `${label}.html`), html + "\n");
  writeFileSync(join(directory, `${label}-render.json`), JSON.stringify({ path: `/essays/${id}`, authenticated: true, renderer: "EssayPage -> SessionView -> SessionProvider -> EssayScreen; real React SSR", stage: page.props.session.stage, reviewStatus: page.props.session.reviewStatus, completedAt: page.props.session.completedAt, byteLength: Buffer.byteLength(html), readonly: false, scoreVisible: true, issueVisible: true, failedMessage: failed, retryButton: failed }, null, 2) + "\n");
  console.log(`PASS /essays/${id}: original SessionProvider, score/issues present, failed=${failed}, completedAt=${page.props.session.completedAt}; ${label}.html`);
} finally { getDb().$client.close(); }
