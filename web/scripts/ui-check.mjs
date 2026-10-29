import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Node 22+, no browser automation packages. Use a Chrome instance launched with
// --remote-debugging-port=9223 and a separate --user-data-dir. Every run creates
// and disposes its own incognito browser context, including storage and workers.
// APP_URL, CHROME_DEBUG_URL, UI_ARTIFACT_DIR and UI_CHECK_PWA=1 are optional.
const app = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
const debug = (process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223").replace(/\/$/, "");
const project = fileURLToPath(new URL("..", import.meta.url));
const artifacts = path.resolve(process.env.UI_ARTIFACT_DIR || path.join(project, "..", ".impeccable", "review"));
const started = Date.now();
const captures = [];
const consoleExceptions = [];
let assertions = 0;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const verify = (condition, message) => { assertions += 1; assert.ok(condition, message); };

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.listeners = new Map();
    this.sequence = 0;
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const task = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(task.timer);
        if (message.error) task.reject(new Error(message.error.message));
        else task.resolve(message.result);
      }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params);
    });
  }

  async send(method, params = {}) {
    await this.ready;
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)); }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(listener);
  }

  close() { this.socket.close(); }
}

let browser;
let page;
let context;

async function evaluate(expression) {
  const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(expression, label, timeout = 10_000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    try { if (await evaluate(expression)) return; }
    catch (error) { if (!/context|navigat|destroyed/i.test(error.message)) throw error; }
    await sleep(75);
  }
  throw new Error(`UI did not reach expected state: ${label}`);
}

async function navigate(route, selector = ".screen h1") {
  await page.send("Page.navigate", { url: new URL(route, app).href });
  await waitFor(`location.pathname === ${JSON.stringify(route.split("?")[0])} && document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)}) && getComputedStyle(document.querySelector('.app-shell')).display === 'flex'`, `${route} document and styles finish loading`);
  await waitFor("!document.querySelector('.loading-surface')", `${route} finishes loading`);
  verify(!await evaluate("!!document.querySelector('[role=dialog]')"), `${route} must be a full page, not a modal`);
}

async function viewport(width, height = 844) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width <= 480 });
  await sleep(80);
}

async function click(selector) {
  const escaped = JSON.stringify(selector);
  await waitFor(`!!document.querySelector(${escaped})`, `control ${selector} exists`);
  await evaluate(`document.querySelector(${escaped}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
  await sleep(80);
  const target = await evaluate(`(() => {const element=document.querySelector(${escaped});const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height,disabled:element.disabled};})()`);
  verify(target.width > 0 && target.height > 0 && !target.disabled, `${selector} is visible and enabled`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x, y: target.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
}

async function fill(selector, value) {
  await evaluate(`(() => {const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Missing field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
}

async function capture(name) {
  await mkdir(artifacts, { recursive: true });
  await sleep(120);
  const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const destination = path.join(artifacts, name);
  await writeFile(destination, Buffer.from(result.data, "base64"));
  captures.push(destination);
}

async function checkLayout(route, width) {
  const layout = await evaluate(`(() => {const shell=document.querySelector('.app-shell');const main=document.querySelector('.page-main');const bounds=shell.getBoundingClientRect();const bad=[...document.querySelectorAll('.screen,.screen form,.screen .primary-button,.screen .secondary-button,.app-tabbar,.checkpoint-detail,.route-heading,.stat-grid,.run-days,.leaderboard-row')].filter(element=>{const r=element.getBoundingClientRect();return r.width&&(r.left<bounds.left-1||r.right>bounds.right+1)}).map(element=>element.className);return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,shellWidth:bounds.width,mainWidth:main.clientWidth,mainScrollWidth:main.scrollWidth,bad,dialogs:document.querySelectorAll('[role=dialog]').length};})()`);
  verify(layout.documentWidth <= width + 1, `${route} has no viewport overflow at ${width}px`);
  verify(layout.mainScrollWidth <= layout.mainWidth + 1, `${route} has no content overflow at ${width}px`);
  verify(layout.shellWidth <= Math.min(width, 480) + 1, `${route} remains phone width at ${width}px`);
  verify(layout.bad.length === 0, `${route} has overflowing controls at ${width}px: ${layout.bad.join(", ")}`);
  verify(layout.dialogs === 0, `${route} renders without dialogs`);
  const tabs = await evaluate("[...document.querySelectorAll('.app-tabbar a')].map(a=>({path:new URL(a.href).pathname,current:a.getAttribute('aria-current')}))");
  verify(tabs.map(tab => tab.path).join(",") === "/,/streak,/crew,/settings", "Bottom navigation uses real route links");
  const active = ["/", "/streak", "/crew", "/settings"].find(tab => tab === "/" ? route === "/" : route.startsWith(tab));
  if (active) verify(tabs.find(tab => tab.path === active)?.current === "page", `${active} is marked active`);
}

async function checkIslandFit(width) {
  const fit = await evaluate(`(() => {const stageElement=document.querySelector('.route-stage');const stage=stageElement.getBoundingClientRect();const canvas=document.querySelector('.route-canvas').getBoundingClientRect();return {stage:{left:stage.left,right:stage.right,top:stage.top,bottom:stage.bottom},canvas:{left:canvas.left,right:canvas.right,top:canvas.top,bottom:canvas.bottom,width:canvas.width,height:canvas.height},background:getComputedStyle(stageElement).backgroundImage,scrollHeight:stageElement.scrollHeight,clientHeight:stageElement.clientHeight};})()`);
  verify(fit.canvas.width > 150 && fit.canvas.height > 200, `The island remains legible at ${width}px`);
  verify(fit.canvas.left >= fit.stage.left - 1 && fit.canvas.right <= fit.stage.right + 1, `The island fits the map width at ${width}px`);
  verify(Math.abs(fit.canvas.width / fit.canvas.height - 1 / 6) < .01, `The winding board preserves its 1:6 proportions at ${width}px`);
  verify(fit.scrollHeight > fit.clientHeight, `The complete 30-day route can be scrolled at ${width}px`);
  verify(fit.background.includes('island-board-v2.png'), `The map uses the island artwork at ${width}px`);
  const covered = await evaluate(`(() => {const find=document.querySelector('.locate-button').getBoundingClientRect();const stage=document.querySelector('.route-stage').getBoundingClientRect();return [...document.querySelectorAll('.map-location,.checkpoint')].filter(element=>{const r=element.getBoundingClientRect();const left=Math.max(r.left,stage.left),right=Math.min(r.right,stage.right),top=Math.max(r.top,stage.top),bottom=Math.min(r.bottom,stage.bottom);return left<right&&top<bottom&&find.left<right&&find.right>left&&find.top<bottom&&find.bottom>top}).map(element=>element.getAttribute('aria-label')||element.textContent.trim());})()`);
  verify(covered.length === 0, `Find me does not cover map labels or checkpoints at ${width}px: ${covered.join(', ')}`);
  const board = await evaluate(`(() => {const nodes=[...document.querySelectorAll('.checkpoint')];const rects=nodes.map(el=>el.getBoundingClientRect());const overlaps=[];for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(rects[i].left<rects[j].right-1&&rects[i].right>rects[j].left+1&&rects[i].top<rects[j].bottom-1&&rects[i].bottom>rects[j].top+1)overlaps.push([i+1,j+1]);return {labels:nodes.map(el=>el.getAttribute('aria-label')),sizes:rects.map(r=>[r.width,r.height]),overlaps};})()`);
  verify(board.labels.length === 30 && board.labels.every((label,index)=>label?.startsWith('Day '+(index+1)+':')), `All 30 distinct day controls are present and labeled at ${width}px`);
  verify(board.sizes.every(([w,h])=>w>=44&&h>=44), `Each day is a touch-friendly control at ${width}px`);
  verify(board.overlaps.length===0, `Day controls do not overlap at ${width}px: ${JSON.stringify(board.overlaps)}`);
  verify(await evaluate(`(() => {const centers=[...document.querySelectorAll('.checkpoint')].map(node=>{const rect=node.getBoundingClientRect();return Math.round(rect.top+rect.height/2)});return !document.querySelector('.trail-overlay, .trail-track, .trail-progress') && document.querySelectorAll('.route-dots .route-dot').length >= 30 && new Set(centers).size>=24})()`), `The swimming route uses separate dots and no road at ${width}px`);
  verify(await evaluate(`(() => {const face=document.querySelector('.checkpoint-face');return getComputedStyle(face).borderRadius === '50%'})()`), `Day markers are circular dots at ${width}px`);
  const chestOverlap = await evaluate(`(() => {const chest=document.querySelector('.treasure-chest').getBoundingClientRect();return [...document.querySelectorAll('.checkpoint')].filter(node=>{const r=node.getBoundingClientRect();return chest.left<r.right-1&&chest.right>r.left+1&&chest.top<r.bottom-1&&chest.bottom>r.top+1}).map(node=>node.getAttribute('aria-label'));})()`);
  verify(chestOverlap.length===0, `The chest does not cover a day control at ${width}px: ${chestOverlap.join(', ')}`);
  if (width <= 320) verify(await evaluate(`(() => {const title=document.querySelector('.route-heading h1');const range=document.createRange();range.selectNodeContents(title);return range.getClientRects().length===1;})()`), "The route heading fits on one line on a small phone");
}

try {
  let response;
  try { response = await fetch(`${debug}/json/version`); }
  catch { throw new Error(`Chrome debugger is unavailable at ${debug}. Start Chrome with --remote-debugging-port=9223 and a separate --user-data-dir.`); }
  verify(response.ok, `Chrome debugger is available at ${debug}`);
  const version = await response.json();
  browser = new CDP(version.webSocketDebuggerUrl);
  ({ browserContextId: context } = await browser.send("Target.createBrowserContext", { disposeOnDetach: true }));
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: context });
  let target;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const list = await (await fetch(`${debug}/json/list`)).json();
    target = list.find(item => item.id === targetId);
    if (target?.webSocketDebuggerUrl) break;
    await sleep(50);
  }
  verify(target?.webSocketDebuggerUrl, "The isolated browser context exposes a page debugger");
  page = new CDP(target.webSocketDebuggerUrl);
  page.on("Runtime.exceptionThrown", event => consoleExceptions.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");

  await viewport(390);
  await navigate("/", ".escape-screen .check-in-action");
  await waitFor("!document.querySelector('.check-in-action').disabled", "Practice island is ready");
  verify(await evaluate("getComputedStyle(document.querySelector('.map-mascot .mascot-portrait')).backgroundImage.includes('mascot.png')"), "The supplied mascot appears on the island");
  verify(await evaluate("!!document.querySelector('.map-self-avatar .player-avatar.avatar-fern') && !!document.querySelector('.map-mascot .mascot-portrait')"), "The player's default explorer and pursuing mascot appear on the route");
  verify(await evaluate(`(async () => {const sprite=document.querySelector('.map-self-avatar .avatar-sprite');if(!sprite)return false;const match=getComputedStyle(sprite).backgroundImage.match(/url\(["']?(.*?)["']?\)/);if(!match)return false;const image=new Image();image.src=match[1];try{await image.decode();return image.naturalWidth>0}catch{return false}})()`), "The swimmer portrait artwork loads successfully");
  verify(await evaluate("getComputedStyle(document.querySelector('.map-self-avatar .player-avatar')).animationName === 'swimmer-stroke' && getComputedStyle(document.querySelector('.map-mascot .mascot-portrait')).animationName === 'mascot-chase' && getComputedStyle(document.querySelector('.swim-wake')).animationName === 'swim-ripple'"), "The player swims with a wake and the pursuing mascot animates");
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  verify(await evaluate("parseFloat(getComputedStyle(document.querySelector('.map-mascot .mascot-portrait')).animationDuration) < .01"), "Mascot motion respects reduced motion");
  verify(await evaluate("parseFloat(getComputedStyle(document.querySelector('.map-self-avatar .player-avatar')).animationDuration) < .01 && parseFloat(getComputedStyle(document.querySelector('.swim-wake')).animationDuration) < .01"), "Swimming and water motion respect reduced motion");
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  await checkLayout("/", 390);
  await checkIslandFit(390);
  await waitFor(`(() => {const stage=document.querySelector('.route-stage');const rect=stage.getBoundingClientRect();const day=document.querySelector('.checkpoint[aria-label^="Day 1:"]').getBoundingClientRect();return stage.scrollTop>0 && day.top>=rect.top && day.bottom<=rect.bottom})()`, "The board opens at day 1");
  verify(await evaluate(`(() => {const stage=document.querySelector('.route-stage');const rect=stage.getBoundingClientRect();const day=document.querySelector('.checkpoint[aria-label^="Day 1:"]').getBoundingClientRect();return stage.scrollTop>0 && day.top>=rect.top && day.bottom<=rect.bottom})()`), "A fresh route opens at the player's starting checkpoint");
  verify(await evaluate(`(async () => {const image=new Image();image.src='/images/island-board-v2.png';try{await image.decode();return image.naturalWidth>0&&image.naturalHeight>0}catch{return false}})()`), "The island artwork loads successfully");
  await capture("mobile.png");
  await click(".treasure-chest");
  await waitFor("!!document.querySelector('.reward-detail')", "Reward chest opens its details");
  verify(await evaluate("document.querySelector('.treasure-chest').classList.contains('is-locked') && document.querySelector('.reward-detail').textContent.includes('Complete 30 days') && !document.querySelector('.reward-open,.reward-letter')"), "The reward remains locked before day 30");
  await click(".reward-detail .hide-map-detail");
  await capture("board-top.png");
  verify(await evaluate("!!document.querySelector('.map-dock .check-in-action') && !document.querySelector('.checkpoint-detail')"), "Daily check-in stays visible while map details start collapsed");
  await click(".show-map-detail");
  verify(await evaluate("!!document.querySelector('.checkpoint-detail')"), "Map details can be opened");
  await click(".hide-map-detail");
  verify(await evaluate("!document.querySelector('.checkpoint-detail') && !!document.querySelector('.show-map-detail')"), "Map details can be hidden for a larger view");
  await click(".checkpoint.is-harbor");
  await waitFor("document.querySelector('.checkpoint-detail h2')?.textContent.includes('escape boat')", "Tapping the harbor selects its checkpoint");
  verify(await evaluate("document.querySelector('.checkpoint.is-harbor').getAttribute('aria-pressed') === 'true'"), "Map selection has accessible pressed state");
  await click(".checkpoint-detail button.primary-button");
  await waitFor("!!document.querySelector('.check-in-action')", "Back to today's checkpoint works");
  await click(".check-in-action");
  await waitFor("!!document.querySelector('.checkpoint-detail .logged')", "Check-in visibly completes");
  verify(await evaluate("JSON.parse(localStorage.getItem('escape-game-practice-v2')).days.length === 1"), "One daily practice check-in is saved");
  verify(!await evaluate("!!document.querySelector('.check-in-action')"), "A second check-in is unavailable after logging today");
  await navigate("/", ".escape-screen .logged");
  verify(await evaluate("JSON.parse(localStorage.getItem('escape-game-practice-v2')).days.length === 1"), "Check-in persists after reload");
  console.log("PASS map selection, daily check-in, duplicate prevention and persistence");

  await click(".app-tabbar a[href='/streak']");
  await waitFor("location.pathname === '/streak' && !!document.querySelector('.streak-screen')", "Streak tab navigates to a real page");
  await capture("streak.png");
  verify(await evaluate("document.querySelectorAll('.week-days .logged').length === 1 && document.querySelectorAll('.calendar-date.logged').length === 1"), "The week and calendar show the saved check-in");
  const currentMonth = await evaluate("document.querySelector('.calendar-heading h2').textContent");
  await click(".calendar-heading button[aria-label='Previous month']");
  verify(await evaluate(`document.querySelector('.calendar-heading h2').textContent !== ${JSON.stringify(currentMonth)}`), "Calendar navigates to the previous month");
  await click(".calendar-heading button[aria-label='Next month']");
  verify(await evaluate(`document.querySelector('.calendar-heading h2').textContent === ${JSON.stringify(currentMonth)} && document.querySelectorAll('.calendar-date.logged').length === 1`), "Calendar returns to the current month and its saved check-in");
  const routes = ["/streak", "/crew", "/settings", "/account", "/account/register", "/account/sign-in", "/rooms/create", "/rooms/join", "/report", "/how-to"];
  for (const width of [320, 390]) {
    await viewport(width, width === 320 ? 720 : 844);
    await navigate("/", ".escape-screen .logged");
    await checkLayout("/", width);
    await checkIslandFit(width);
    if (width === 320) await capture("small-phone.png");
    for (const route of routes) {
      await navigate(route);
      await checkLayout(route, width);
    }
  }
  await viewport(1440, 900);
  await navigate("/", ".escape-screen .logged");
  await checkLayout("/", 1440);
  await capture("desktop.png");
  console.log("PASS full-page routes, active navigation and 320/390/1440px overflow checks");

  await viewport(390);
  await navigate("/settings");
  await click(".avatar-option:has(input[value='coral'])");
  await waitFor("document.querySelector('.avatar-picker .inline-success')?.textContent.includes('saved')", "Avatar selection saves");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2')).avatarId === 'coral'", "Selected avatar reaches local storage");
  verify(await evaluate("JSON.parse(localStorage.getItem('escape-game-practice-v2')).avatarId === 'coral'"), "The selected practice avatar persists locally");
  await click(".avatar-accent-option:has(input[value='sun'])");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2')).avatarAccent === 'sun'", "Selected avatar color reaches local storage");
  verify(await evaluate("JSON.parse(localStorage.getItem('escape-game-practice-v2')).avatarAccent === 'sun'"), "The selected practice avatar color persists locally");
  await navigate("/settings");
  verify(await evaluate("document.querySelector('input[name=avatar][value=coral]').checked"), "The chosen avatar remains selected after reload");
  verify(await evaluate("document.querySelector('input[name=avatarAccent][value=sun]').checked"), "The chosen avatar color remains selected after reload");
  await capture("avatar-settings.png");
  await navigate("/", ".escape-screen .logged");
  verify(await evaluate("!!document.querySelector('.map-self-avatar .player-avatar.avatar-coral')"), "The saved avatar appears on the island");
  verify(await evaluate("!!document.querySelector('.map-self-avatar .player-avatar.avatar-coral.accent-sun')"), "The saved swimmer color appears on the island");
  await capture("avatar-map.png");
  await navigate("/settings");
  await fill("input[name='username']", "Island Tester");
  await fill("input[name='reminder']", "19:30");
  await click(".settings-screen form .primary-button");
  await waitFor("!!document.querySelector('.settings-screen .inline-success')", "Local settings show a saved state");
  await navigate("/settings");
  verify(await evaluate("document.querySelector('input[name=username]').value === 'Island Tester' && document.querySelector('input[name=reminder]').value === '19:30'"), "Display name and reminder survive reload");
  await capture("settings.png");

  await navigate("/rooms/join");
  const invitation = "test_invitation_" + "a".repeat(32);
  await fill("input[name='invite']", `${app.origin}/rooms/join?invite=${invitation}`);
  await click(".room-form-screen form .primary-button");
  await waitFor("location.pathname === '/account/sign-in' && !!document.querySelector('.auth-screen form')", "Guest invite continues to sign in");
  verify(await evaluate(`sessionStorage.getItem('escape-game-invite') === ${JSON.stringify(invitation)}`), "Invitation is preserved across authentication navigation");
  let interceptedAuth = 0;
  page.on("Fetch.requestPaused", event => {
    if (new URL(event.request.url).pathname !== "/api/auth") return;
    interceptedAuth += 1;
    void page.send("Fetch.fulfillRequest", {
      requestId: event.requestId,
      responseCode: 503,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify({ error: "Online play is unavailable for this browser check. Try again later." })).toString("base64"),
    });
  });
  await page.send("Fetch.enable", { patterns: [{ urlPattern: `${app.origin}/api/auth`, requestStage: "Request" }] });
  await fill("input[name='email']", "ui-check@example.invalid");
  await fill("input[name='password']", "test-only-password");
  await click(".auth-screen form .primary-button");
  await waitFor("document.querySelector('.auth-screen .inline-error')?.textContent.includes('browser check')", "Authentication errors render inline");
  verify(interceptedAuth === 1, "Authentication failure used interception without creating a real account");
  await capture("sign-in.png");
  await page.send("Fetch.disable");
  console.log("PASS settings persistence, invitation handoff and recoverable authentication error");

  await navigate("/report");
  verify(await evaluate("document.querySelector('.danger-button').disabled"), "Ending a run requires explicit confirmation");
  await click(".report-screen input[type=checkbox]");
  await click(".report-screen .danger-button");
  await waitFor("document.querySelector('.report-screen h1')?.textContent.includes('honest')", "An honest report ends practice visibly");
  verify(await evaluate("!!document.querySelector('.report-screen .mascot-report.mascot-hungry')"), "The mascot reacts when a run ends");
  verify(await evaluate("JSON.parse(localStorage.getItem('escape-game-practice-v2')).eliminated === true"), "Practice elimination persists");
  await click(".report-screen button.primary-button");
  await waitFor("location.pathname === '/' && !!document.querySelector('.check-in-action')", "Fresh practice returns to an interactive route");
  verify(await evaluate("(() => {const state=JSON.parse(localStorage.getItem('escape-game-practice-v2'));return state.days.length === 0 && state.eliminated === false})()"), "Only local practice resets; its progress is cleared");
  console.log("PASS report confirmation, ended state and local practice restart");

  // A synthetic, local-only history makes the day-30 reward testable without
  // bypassing production room rules or making online writes.
  const practiceBeforeRewardTest = await evaluate("localStorage.getItem('escape-game-practice-v2')");
  await evaluate(`(() => {const state=JSON.parse(localStorage.getItem('escape-game-practice-v2'));const today=new Date();const localDay=new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()));state.days=Array.from({length:30},(_,index)=>new Date(localDay.getTime()-(29-index)*2*86400000).toISOString().slice(0,10));state.eliminated=false;localStorage.setItem('escape-game-practice-v2',JSON.stringify(state));})()`);
  await navigate("/", ".escape-screen");
  await waitFor("!!document.querySelector('.treasure-chest.is-locked')", "A nonconsecutive practice history cannot unlock the chest");
  await click(".treasure-chest");
  verify(await evaluate("!document.querySelector('.reward-open,.reward-letter')"), "Thirty scattered practice check-ins do not unlock the letter");
  await evaluate(`(() => {const state=JSON.parse(localStorage.getItem('escape-game-practice-v2'));const today=new Date();const localDay=new Date(Date.UTC(today.getFullYear(),today.getMonth(),today.getDate()));state.days=Array.from({length:30},(_,index)=>new Date(localDay.getTime()-(29-index)*86400000).toISOString().slice(0,10));state.eliminated=false;localStorage.setItem('escape-game-practice-v2',JSON.stringify(state));})()`);
  await navigate("/", ".escape-screen");
  await waitFor("!!document.querySelector('.treasure-chest.is-unlocked')", "A completed practice streak unlocks its chest");
  await click(".treasure-chest");
  verify(await evaluate("!!document.querySelector('.reward-open') && !document.querySelector('.reward-letter')"), "A completed run can open its reward but the letter starts closed");
  await click(".reward-open");
  verify(await evaluate("document.querySelector('.reward-letter')?.textContent.includes('Thirty days')"), "The reward opens a real letter");
  await evaluate("(() => {const state=JSON.parse(localStorage.getItem('escape-game-practice-v2'));state.eliminated=true;localStorage.setItem('escape-game-practice-v2',JSON.stringify(state));})()");
  await navigate("/", ".escape-screen");
  await waitFor("!!document.querySelector('.treasure-chest.is-locked')", "An eliminated run does not unlock the reward");
  await click(".treasure-chest");
  verify(await evaluate("!document.querySelector('.reward-open,.reward-letter')"), "An eliminated player cannot open the letter");
  await evaluate(`localStorage.setItem('escape-game-practice-v2', ${JSON.stringify(practiceBeforeRewardTest)})`);
  console.log("PASS reward chest stays locked until an eligible 30-day run and opens its letter");

  if (process.env.UI_CHECK_PWA === "1") {
    await waitFor("navigator.serviceWorker.getRegistration().then(registration => registration?.active?.state === 'activated')", "Production service worker activates", 15_000);
    await navigate("/streak");
    await navigate("/", ".escape-screen");
    await waitFor("!!navigator.serviceWorker.controller", "A reload is controlled by the service worker");
    await page.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await click(".app-tabbar a[href='/streak']");
    await waitFor("location.pathname === '/streak' && !!document.querySelector('.streak-screen h1')", "Cached streak page opens through navigation while offline");
    verify(await evaluate("!navigator.onLine && !!navigator.serviceWorker.controller"), "Offline navigation uses the installed service worker");
    await page.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    console.log("PASS production PWA controlled reload and cached offline navigation");
  }

  // Exercise a shared room without creating accounts or writing to a live database.
  // The session fixture contains aggregate progress only, as the real API does.
  let finnProgress = 8;
  let sessionRequests = 0;
  let alexAvatar = "fern";
  let alexAccent = "sea";
  let avatarWrites = 0;
  page.on("Fetch.requestPaused", event => {
    const pathname = new URL(event.request.url).pathname;
    if (!["/api/session", "/api/room/feed", "/api/profile/avatar"].includes(pathname)) return;
    if (pathname === "/api/profile/avatar") {
      const input = JSON.parse(event.request.postData || "{}");
      if (event.request.method === "PATCH" && ["fern", "coral", "sky", "sun"].includes(input.avatarId) && ["sea", "coral", "sun", "leaf"].includes(input.avatarAccent)) { alexAvatar = input.avatarId; alexAccent = input.avatarAccent; avatarWrites += 1; }
      void page.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify({ avatarId: alexAvatar, avatarAccent: alexAccent })).toString("base64") });
      return;
    }
    const payload = pathname === "/api/room/feed" ? { events: [] } : {
      user: { username: "Alex", avatarId: alexAvatar, avatarAccent: alexAccent, timezone: "UTC", reminder: "20:00" },
      room: {
        id: "11111111-1111-4111-8111-111111111111", name: "Test crew", timezone: "UTC", phase: "active",
        checkedInDays: ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"],
        players: [
          { id: "self", username: "Alex", avatarId: alexAvatar, avatarAccent: alexAccent, status: "alive", checkedIn: true, streak: 5, progress: 5, self: true },
          { id: "mara", username: "Mara", avatarId: "coral", avatarAccent: "coral", status: "alive", checkedIn: true, streak: 3, progress: 3, self: false },
          { id: "kai", username: "Kai", avatarId: "sky", avatarAccent: "leaf", status: "eliminated", checkedIn: false, streak: 0, progress: 3, self: false },
          { id: "finn", username: "Finn", avatarId: "sun", avatarAccent: "sun", status: "alive", checkedIn: true, streak: finnProgress, progress: finnProgress, self: false },
        ],
      },
    };
    if (pathname === "/api/session") sessionRequests += 1;
    void page.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(payload)).toString("base64") });
  });
  await page.send("Fetch.enable", { patterns: [{ urlPattern: `${app.origin}/api/session*`, requestStage: "Request" }, { urlPattern: `${app.origin}/api/room/feed*`, requestStage: "Request" }, { urlPattern: `${app.origin}/api/profile/avatar*`, requestStage: "Request" }] });
  await viewport(320, 720);
  await navigate("/", ".escape-screen");
  await waitFor("!!document.querySelector('.crew-toggle')", "Shared room crew control appears");
  await click(".crew-toggle");
  await waitFor("document.querySelectorAll('.crew-map-chip').length === 4 && document.querySelectorAll('.map-crew-marker').length === 2", "Shared room members and grouped map markers appear");
  await checkLayout("/", 320);
  await checkIslandFit(320);
  verify(await evaluate("!!document.querySelector('.map-self-avatar .player-avatar.avatar-fern.accent-sea') && !!document.querySelector('.map-crew-marker .player-avatar.avatar-sun.accent-sun') && !!document.querySelector('.map-crew-marker .player-avatar.avatar-coral.accent-coral')"), "Room map displays saved avatars and colors for the player and friends");
  verify(await evaluate("document.querySelector('.map-crew-count')?.textContent === '+1'"), "Members at the same position are grouped with a count");
  await click(".crew-map-chip:nth-child(3)");
  await waitFor("document.querySelector('.player-detail h2')?.textContent === 'Kai'", "Selecting an eliminated crewmate opens their details");
  verify(await evaluate("!!document.querySelector('.map-crew-marker.is-selected .player-avatar.avatar-sky')"), "Selecting a grouped friend shows that friend's avatar on the map");
  verify(await evaluate("document.querySelector('.player-status').textContent.includes('Eaten') && document.querySelector('.player-detail').textContent.includes('3/30') && document.querySelector('.player-detail').textContent.includes('2 days behind')"), "Eliminated member retains their position and relative progress");
  await click(".crew-map-chip:nth-child(2)");
  await waitFor("document.querySelector('.player-detail h2')?.textContent === 'Mara'", "Grouped members remain individually selectable");
  verify(await evaluate("document.querySelector('.player-status').textContent.includes('Checked in')"), "Living member's check-in status is shown");
  await click(".crew-map-chip:nth-child(4)");
  await waitFor("document.querySelector('.player-detail h2')?.textContent === 'Finn'", "A player ahead can be selected");
  verify(await evaluate("document.querySelector('.player-detail').textContent.includes('3 days ahead')"), "Relative progress identifies a player ahead");
  await capture("crew-map.png");
  const previousRequests = sessionRequests;
  finnProgress = 9;
  await click(".crew-map-refresh");
  await waitFor("document.querySelector('.player-detail')?.textContent.includes('9/30')", "Refresh updates the selected player's progress");
  verify(sessionRequests > previousRequests, "Refresh requests current room data");
  await sleep(100); // Let the browser paint the updated position and start transitions.
  console.log("Marker motion:", await evaluate("[...document.querySelectorAll('.map-crew-marker')].map(marker=>({label:marker.getAttribute('aria-label'),duration:getComputedStyle(marker).transitionDuration,animations:marker.getAnimations().map(animation=>({state:animation.playState,property:animation.transitionProperty}))}))"));
  verify(await evaluate("[...document.querySelectorAll('.map-crew-marker')].some(marker => marker.getAttribute('aria-label').includes('Finn') && marker.getAnimations().some(animation => animation.playState === 'running' && animation.transitionProperty))"), "A moving player's marker animates after the room refresh");
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  verify(await evaluate("parseFloat(getComputedStyle(document.querySelector('.map-crew-marker')).transitionDuration) < 0.01"), "Reduced motion makes marker movement effectively immediate");
  await page.send("Emulation.setEmulatedMedia", { features: [] });
  await navigate("/settings");
  await click(".avatar-option:has(input[value='sky'])");
  await waitFor("document.querySelector('.avatar-picker .inline-success')?.textContent.includes('saved')", "Online avatar selection saves");
  verify(avatarWrites === 1 && alexAvatar === "sky" && alexAccent === "sea", "Online avatar update sends the selected choice to the profile endpoint");
  await click(".avatar-accent-option:has(input[value='leaf'])");
  await waitFor("document.querySelector('input[name=avatarAccent][value=leaf]').checked", "Online avatar color selection saves");
  verify(avatarWrites === 2 && alexAvatar === "sky" && alexAccent === "leaf", "Online avatar color update preserves the chosen character");
  await navigate("/settings");
  verify(await evaluate("document.querySelector('input[name=avatar][value=sky]').checked"), "Online avatar survives a fresh session response");
  verify(await evaluate("document.querySelector('input[name=avatarAccent][value=leaf]').checked"), "Online avatar color survives a fresh session response");
  await page.send("Fetch.disable");
  console.log("PASS shared-room map grouping, player status, refresh, animation and reduced motion");
  verify(consoleExceptions.length === 0, `Browser runtime exceptions: ${consoleExceptions.join("\n")}`);
  await rm(path.join(artifacts, "failure.png"), { force: true });
  console.log(JSON.stringify({ result: "passed", assertions, elapsedSeconds: Math.round((Date.now() - started) / 1000), screenshots: captures }, null, 2));
} catch (error) {
  if (page) {
    try { await capture("failure.png"); }
    catch { /* Keep the original failure if Chrome itself disconnected. */ }
    try {
      const diagnostic = await evaluate("(async () => ({url:location.href,ready:document.readyState,headerDisplay:document.querySelector('.app-header')&&getComputedStyle(document.querySelector('.app-header')).display,styles:await Promise.all([...document.styleSheets].map(async sheet=>{if(!sheet.href)return {inline:true};const response=await fetch(sheet.href);const css=await response.text();return {url:sheet.href,status:response.status,containsHeader:css.includes('.app-header'),containsRouteHeading:css.includes('.route-heading')};}))}))()");
      console.error(JSON.stringify({ diagnostic }, null, 2));
    } catch { /* A failed page must not prevent isolated-context cleanup. */ }
  }
  console.error(`UI CHECK FAILED: ${error.message}`);
  if (consoleExceptions.length) console.error(consoleExceptions.join("\n"));
  process.exitCode = 1;
} finally {
  if (browser && context) await browser.send("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {});
  page?.close();
  browser?.close();
}
