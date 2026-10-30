import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Isolated Chrome context: only synthetic practice data is written.
const app = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
const debug = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDP {
  constructor(url) {
    this.socket = new WebSocket(url); this.pending = new Map(); this.id = 0;
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", event => { const message = JSON.parse(event.data); const task = this.pending.get(message.id); if (!task) return; this.pending.delete(message.id); clearTimeout(task.timer); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); });
  }
  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => { const id = ++this.id; const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)); }, 15000); this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  close() { this.socket.close(); }
}
let browser, page, context, assertions = 0;
const verify = (condition, message) => { assertions++; assert.ok(condition, message); };
async function evaluate(expression) { const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, label) { for (let i = 0; i < 200; i++) { try { if (await evaluate(expression)) return; } catch (error) { if (!/context|navigat|destroyed/i.test(error.message)) throw error; } await sleep(75); } throw new Error(`Timed out waiting for ${label}`); }
async function navigate(route, selector) { await page.send("Page.navigate", { url: new URL(route, app).href }); await waitFor(`location.pathname === ${JSON.stringify(route)} && !!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('.loading-surface')`, `${route} ${selector}`); }
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`); const point = await evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`); await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }); await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }); }

try {
  const version = await (await fetch(`${debug}/json/version`)).json();
  browser = new CDP(version.webSocketDebuggerUrl);
  ({ browserContextId: context } = await browser.send("Target.createBrowserContext", { disposeOnDetach: true }));
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: context });
  let target;
  for (let i = 0; i < 30; i++) { target = (await (await fetch(`${debug}/json/list`)).json()).find(item => item.id === targetId); if (target?.webSocketDebuggerUrl) break; await sleep(50); }
  verify(!!target?.webSocketDebuggerUrl, "Chrome created an isolated page");
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: "localStorage.setItem('escape-onboarding-v1','done')" });
  const routes = [["/", ".escape-screen"], ["/streak", ".streak-screen"], ["/crew", ".crew-screen"], ["/settings", ".settings-screen"], ["/account", ".screen"], ["/account/register", ".screen"], ["/account/sign-in", ".screen"], ["/rooms/create", ".screen"], ["/rooms/join", ".screen"], ["/report", ".screen"], ["/how-to", ".screen"]];
  for (const [width, height] of [[320, 720], [390, 844], [1440, 900]]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 390 });
    for (const [route, selector] of routes) {
      await navigate(route, selector);
      const fit = await evaluate("(() => {const shell=document.querySelector('.app-shell'),main=document.querySelector('.page-main');return {document:document.documentElement.scrollWidth, viewport:innerWidth, shell:shell.getBoundingClientRect().width, main:main.clientWidth, content:main.scrollWidth,tabs:document.querySelectorAll('.app-tabbar a').length}})()");
      verify(fit.document <= width + 1 && fit.content <= fit.main + 1 && fit.shell <= Math.min(width, 480) + 1, `${route} fits ${width}px`);
      verify(fit.tabs === 4, `${route} has four navigation links`);
    }
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/", ".escape-screen");
  await waitFor("document.querySelectorAll('.checkpoint-3d').length === 30 && !!document.querySelector('.dock-primary-cta') && !document.querySelector('.dock-primary-cta').disabled", "practice map");
  verify(await evaluate("document.querySelectorAll('.checkpoint-3d[aria-label]').length === 30"), "All 30 checkpoints are labeled");
  await click(".checkpoint-3d[aria-label^='Day 2:']");
  await waitFor("!!document.querySelector('.checkpoint-detail-card')", "checkpoint details");
  verify(await evaluate("document.querySelector('.checkpoint-3d[aria-label^=\"Day 2:\"]').getAttribute('aria-pressed') === 'true'"), "Selecting a checkpoint updates its accessible state");
  await click(".hide-detail-btn");
  await click(".dock-primary-cta");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2') || '{}').days?.length === 1", "practice check-in");
  await navigate("/", ".escape-screen");
  await waitFor("document.querySelector('.dock-primary-cta')?.textContent.includes('Logged')", "saved check-in after reload");
  verify(await evaluate("JSON.parse(localStorage.getItem('escape-game-practice-v2')).days.length === 1"), "Practice check-in persists without duplication");
  await navigate("/streak", ".streak-screen");
  verify(await evaluate("document.querySelectorAll('.calendar-date.logged').length === 1"), "The streak calendar shows the saved check-in");
  await evaluate("(() => {const state=JSON.parse(localStorage.getItem('escape-game-practice-v2'));const today=state.days[0];const yesterday=new Date(Date.parse(today+'T00:00:00Z')-86400000).toISOString().slice(0,10);state.days.unshift(yesterday);localStorage.setItem('escape-game-practice-v2',JSON.stringify(state))})()");
  await navigate("/settings", ".settings-screen");
  await click("#practice-day-reset summary");
  await evaluate("document.querySelector('#practice-day-reset').scrollIntoView({block:'center'})");
  const artifacts = path.resolve(process.env.UI_ARTIFACT_DIR || fileURLToPath(new URL("../../.impeccable/review/", import.meta.url)));
  await mkdir(artifacts, { recursive: true });
  await writeFile(path.join(artifacts, "practice-day-reset.png"), Buffer.from((await page.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await click("#practice-day-reset button");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2')).days.length === 1", "today's practice log reset while earlier days remain");
  await navigate("/", ".escape-screen");
  await waitFor("document.querySelector('.dock-primary-cta')?.tagName === 'BUTTON' && !document.querySelector('.dock-primary-cta').disabled", "practice can be checked in again");
  await click(".dock-primary-cta");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2')).days.length === 2", "practice can be logged again after reset");
  verify(true, "Practice day reset persists and allows a new check-in");
  await navigate("/report", ".report-screen");
  verify(await evaluate("document.querySelector('.danger-button').disabled"), "Reporting requires confirmation");
  if (process.env.UI_CHECK_PWA === "1") {
    await waitFor("navigator.serviceWorker.getRegistration().then(registration => registration?.active?.state === 'activated')", "service worker activation");
    await navigate("/streak", ".streak-screen");
    await navigate("/", ".escape-screen");
    await waitFor("!!navigator.serviceWorker.controller", "service worker control");
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await click(".app-tabbar a[href='/streak']");
    await waitFor("location.pathname === '/streak' && !!document.querySelector('.streak-screen')", "offline streak navigation");
    verify(await evaluate("!navigator.onLine && !!navigator.serviceWorker.controller"), "A cached page opens offline through the service worker");
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
  console.log(JSON.stringify({ result: "passed", assertions, note: "Isolated local practice; onboarding, multiplayer and boss controls have separate checks." }, null, 2));
} catch (error) { console.error(`UI CHECK FAILED: ${error.message}`); process.exitCode = 1; }
finally { if (browser && context) await browser.send("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {}); page?.close(); browser?.close(); }
