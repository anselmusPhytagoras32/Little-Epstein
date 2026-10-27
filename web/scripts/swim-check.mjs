import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Node 22+, Chrome with --remote-debugging-port=9223 and a separate profile.
// Creates an isolated browser context and does not write to live accounts.
const app = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
const debug = (process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223").replace(/\/$/, "");
const artifacts = path.resolve(process.env.UI_ARTIFACT_DIR || path.join(fileURLToPath(new URL("..", import.meta.url)), "..", ".impeccable", "review"));
const exceptions = [];
let assertions = 0;
const verify = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

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
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)); }, 15000);
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
async function waitFor(expression, label, timeout = 12000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await evaluate(expression)) return; } catch (error) { if (!/context|navigat|destroyed/i.test(error.message)) throw error; }
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${label}`);
}
async function rect(selector) {
  return evaluate(`(() => {const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing '+${JSON.stringify(selector)});const r=element.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,width:r.width,height:r.height};})()`);
}
async function press(x, y) { await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); }
async function release(x, y) { await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); }
async function click(selector) { const target = await rect(selector); verify(target.width > 0 && target.height > 0, `${selector} is visible`); await press(target.x, target.y); await release(target.x, target.y); }
async function capture(name) {
  await mkdir(artifacts, { recursive: true });
  const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(artifacts, name), Buffer.from(result.data, "base64"));
}

async function navigate(route, selector) {
  await page.send("Page.navigate", { url: new URL(route, app).href });
  await waitFor(`document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(selector)})`, `${route} page`);
}

async function visibleClick(selector) {
  await waitFor(`!!document.querySelector(${JSON.stringify(selector)})`, `control ${selector}`);
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'nearest',behavior:'instant'})`);
  await sleep(200);
  await click(selector);
}

try {
  const response = await fetch(`${debug}/json/version`);
  verify(response.ok, "Chrome debugger is available");
  browser = new CDP((await response.json()).webSocketDebuggerUrl);
  ({ browserContextId: context } = await browser.send("Target.createBrowserContext", { disposeOnDetach: true }));
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: context });
  let target;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    target = (await (await fetch(`${debug}/json/list`)).json()).find(item => item.id === targetId);
    if (target?.webSocketDebuggerUrl) break;
    await sleep(50);
  }
  verify(target?.webSocketDebuggerUrl, "An isolated browser page is available");
  page = new CDP(target.webSocketDebuggerUrl);
  page.on("Runtime.exceptionThrown", event => exceptions.push(event.exceptionDetails.exception?.description || event.exceptionDetails.text));
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/", ".map-self-avatar .player-avatar");
  await waitFor("!!document.querySelector('.checkpoint-3d') && document.querySelectorAll('.route-dot').length > 0", "swimming route");
  await waitFor("!!document.querySelector('.dock-primary-cta') && !document.querySelector('.dock-primary-cta').disabled && !document.querySelector('.dock-primary-cta').textContent.includes('Loading')", "practice hydration finishes");
  await waitFor(`(() => {const stage=document.querySelector('.route-stage');const bounds=stage.getBoundingClientRect();const day=document.querySelector('.checkpoint-3d[aria-label^="Day 1:"]').getBoundingClientRect();return stage.scrollTop>0 && day.top>=bounds.top && day.bottom<=bounds.bottom})()`, "the route opens at day 1");
  verify(await evaluate("document.querySelectorAll('.checkpoint-3d').length === 30"), "All 30 day checkpoints render");
  verify(await evaluate("document.querySelectorAll('.route-dot').length === 87 && !document.querySelector('.trail-overlay')"), "The route uses dots with no road");
  verify(await evaluate("!!document.querySelector('.map-self-avatar .water-splash-wake') && getComputedStyle(document.querySelector('.map-avatar-container')).animationName === 'swimmer-stroke'"), "The swimmer animates with a wake");
  verify(await evaluate("document.querySelector('.map-self-avatar .avatar-sprite image').getAttribute('href').includes('Pixel-Art%20Base%20Avatar')"), "Map avatar uses the supplied pixel-art sprite sheet");
  verify(await evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('.page-main').scrollWidth <= document.querySelector('.page-main').clientWidth"), "The map has no horizontal overflow on a phone");
  await capture("swim-map.png");

  await visibleClick(".map-self-avatar");
  await waitFor("location.pathname === '/settings' && document.querySelectorAll('input[name=avatar]').length === 8", "eight character choices");
  verify(await evaluate("document.querySelectorAll('input[name=avatarAccent]').length === 4"), "Four accent colors are available");
  verify(await evaluate("(async()=>{const i=new Image();i.src='/images/Pixel-Art%20Base%20Avatar%20Selection%20Sheet.png';await i.decode();return i.naturalWidth===1448})()"), "The avatar artwork loads and decodes");
  await visibleClick("label.avatar-option:has(input[value='diver'])");
  await waitFor("document.querySelector('input[name=avatar][value=diver]').checked && !document.querySelector('.avatar-options').disabled", "diver selection saved");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2')).avatarId === 'diver'", "diver persists in practice");
  await visibleClick("label.avatar-accent-option:has(input[value='coral'])");
  await waitFor("document.querySelector('input[name=avatarAccent][value=coral]').checked && !document.querySelector('.avatar-accent-options').disabled", "accent selection saved");
  await waitFor("JSON.parse(localStorage.getItem('escape-game-practice-v2')).avatarAccent === 'coral'", "accent persists in practice");
  await capture("swim-settings.png");
  await navigate("/", ".map-self-avatar .player-avatar");
  await waitFor("!!document.querySelector('.map-self-avatar .avatar-diver.accent-coral')", "saved appearance on the map");
  verify(await evaluate("!!document.querySelector('.map-self-avatar .avatar-diver.accent-coral')"), "The saved character and color appear on the island");
  await navigate("/settings", ".avatar-options");
  await waitFor("document.querySelector('input[name=avatar][value=diver]')?.checked && document.querySelector('input[name=avatarAccent][value=coral]')?.checked", "avatar selection survives reload");
  verify(await evaluate("document.querySelector('input[name=avatar][value=diver]').checked && document.querySelector('input[name=avatarAccent][value=coral]').checked"), "Character and accent survive page reload");

  // Seed local practice only, using 30 consecutive dates ending in the device's
  // current day. No online profile or real account is modified by this check.
  const savedPractice = await evaluate("localStorage.getItem('escape-game-practice-v2')");
  await evaluate(`(() => {const today=new Intl.DateTimeFormat('en-CA',{timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const end=Date.parse(today+'T00:00:00Z');const days=Array.from({length:30},(_,i)=>new Date(end-(29-i)*86400000).toISOString().slice(0,10));localStorage.setItem('escape-game-practice-v2',JSON.stringify({days,name:'Harbor Tester',avatarId:'diver',avatarAccent:'coral',reminder:'20:00',eliminated:false}));})()`);
  await navigate("/", ".treasure-chest-3d");
  await waitFor("!!document.querySelector('.treasure-chest-3d.is-unlocked')", "eligible practice chest unlocks");
  await visibleClick(".treasure-chest-3d");
  await waitFor("!!document.querySelector('.reward-detail') && document.querySelector('.reward-detail .primary-button')?.textContent.includes('Open')", "the eligible chest offers its letter");
  await visibleClick(".reward-detail .primary-button");
  await waitFor("!!document.querySelector('.reward-letter-box')", "the reward letter opens");
  verify(await evaluate("document.querySelector('.reward-letter-box').textContent.includes('30 days logged') && document.querySelector('.reward-letter-box').textContent.includes('Best streak: 30 days')"), "The letter shows the actual logged days and best streak");
  verify(await evaluate("new URL(document.querySelector('.reward-letter-box a').href).pathname === '/streak' && !document.querySelector('.reward-detail video')"), "The reward links to streak details and contains no video");
  await capture("harbor-reward.png");
  await evaluate("(() => {const state=JSON.parse(localStorage.getItem('escape-game-practice-v2'));state.eliminated=true;localStorage.setItem('escape-game-practice-v2',JSON.stringify(state));})()");
  await navigate("/", ".treasure-chest-3d");
  await waitFor("!!document.querySelector('.treasure-chest-3d.is-locked')", "an ended practice cannot unlock the chest");
  await visibleClick(".treasure-chest-3d");
  await waitFor("!!document.querySelector('.reward-detail')", "locked chest explains its requirement");
  verify(await evaluate("!document.querySelector('.reward-letter-box') && !document.querySelector('.reward-detail .primary-button')"), "An ended run cannot open the reward letter");
  await evaluate(`localStorage.setItem('escape-game-practice-v2', ${JSON.stringify(savedPractice)})`);

  await navigate("/", ".boss-ambush-gate-btn.boss-gate-tumz");
  await waitFor("!!document.querySelector('.map-self-avatar .avatar-diver.accent-coral')", "saved swimmer initializes before opening Tumz");
  await sleep(400);
  await visibleClick(".boss-ambush-gate-btn.boss-gate-tumz");
  await waitFor("location.pathname === '/boss' && !!document.querySelector('.boss-start') && !document.querySelector('.boss-start').disabled", "Tumz gate opens the loaded boss screen");
  verify(await evaluate("document.querySelector('.boss-squad-badge')?.textContent.includes('3 SWIMMERS')"), "Tumz gate opens the 3-swimmer raid encounter");

  // Test room and profile synchronization with synthetic responses only.
  let onlineAvatar = "fern";
  let onlineAccent = "sea";
  let profileWrites = 0;
  page.on("Fetch.requestPaused", event => {
    const pathname = new URL(event.request.url).pathname;
    let payload;
    if (pathname === "/api/profile/avatar") {
      const input = JSON.parse(event.request.postData || "{}");
      onlineAvatar = input.avatarId;
      if (input.avatarAccent) onlineAccent = input.avatarAccent;
      profileWrites += 1;
      payload = { ok: true };
    } else if (pathname === "/api/room/feed") payload = { events: [] };
    else if (pathname === "/api/session") payload = {
      user: { username: "Alex", avatarId: onlineAvatar, avatarAccent: onlineAccent, timezone: "UTC" },
      room: { id: "11111111-1111-4111-8111-111111111111", name: "Test crew", timezone: "UTC", phase: "active", checkedInDays: ["2026-11-01", "2026-11-02", "2026-11-03"], players: [
        { id: "self", username: "Alex", avatarId: onlineAvatar, avatarAccent: onlineAccent, status: "alive", checkedIn: true, streak: 3, progress: 3, self: true },
        { id: "mara", username: "Mara", avatarId: "chef", avatarAccent: "sun", status: "alive", checkedIn: true, streak: 2, progress: 2, self: false },
        { id: "kai", username: "Kai", avatarId: "diver", avatarAccent: "leaf", status: "eliminated", checkedIn: false, streak: 0, progress: 2, self: false },
        { id: "finn", username: "Finn", avatarId: "scout", avatarAccent: "coral", status: "alive", checkedIn: true, streak: 5, progress: 5, self: false },
      ] },
    };
    if (!payload) return void page.send("Fetch.continueRequest", { requestId: event.requestId });
    void page.send("Fetch.fulfillRequest", { requestId: event.requestId, responseCode: 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(payload)).toString("base64") });
  });
  await page.send("Fetch.enable", { patterns: ["/api/session*", "/api/room/feed*", "/api/profile/avatar*"].map(pathname => ({ urlPattern: `${app.origin}${pathname}`, requestStage: "Request" })) });
  await navigate("/", ".escape-screen");
  await waitFor("document.querySelectorAll('.map-crew-marker').length === 2 && !!document.querySelector('.crew-toggle')", "room markers load");
  verify(await evaluate("!!document.querySelector('.map-crew-marker .avatar-scout.accent-coral') && !!document.querySelector('.map-crew-marker .avatar-chef.accent-sun') && document.querySelector('.map-crew-count').textContent === '+1'"), "Friends' selected avatars render, including grouped swimmers");
  await visibleClick(".crew-toggle");
  await waitFor("document.querySelectorAll('.crew-map-chip').length === 4", "room roster opens");
  await visibleClick(".crew-map-chip:nth-child(3)");
  await waitFor("document.querySelector('.player-detail h2')?.textContent === 'Kai'", "eliminated player details open");
  verify(await evaluate("document.querySelector('.player-detail').textContent.includes('Caught') && document.querySelector('.player-detail').textContent.includes('2/30') && !!document.querySelector('.map-crew-marker.is-selected .avatar-diver.accent-leaf')"), "Selecting a grouped eliminated swimmer shows the correct avatar and saved progress");
  await navigate("/settings", ".avatar-options");
  await waitFor("document.querySelector('input[name=avatar][value=fern]')?.checked", "online avatar settings load");
  await visibleClick(".avatar-option:has(input[value='builder'])");
  await waitFor("document.querySelector('input[name=avatar][value=builder]')?.checked && !document.querySelector('.avatar-options').disabled", "online avatar saves");
  verify(profileWrites >= 1 && onlineAvatar === "builder", "An online character update reaches the profile endpoint");
  await visibleClick(".avatar-accent-option:has(input[value='leaf'])");
  await waitFor("document.querySelector('input[name=avatarAccent][value=leaf]')?.checked && !document.querySelector('.avatar-accent-options').disabled", "online accent saves");
  verify(profileWrites >= 2 && onlineAvatar === "builder" && onlineAccent === "leaf", "An online accent update preserves the selected character");
  await navigate("/settings", ".avatar-options");
  await waitFor("document.querySelector('input[name=avatar][value=builder]')?.checked && document.querySelector('input[name=avatarAccent][value=leaf]')?.checked", "online profile selection survives refresh");
  verify(await evaluate("document.querySelector('input[name=avatar][value=builder]').checked && document.querySelector('input[name=avatarAccent][value=leaf]').checked"), "Online choices persist after a fresh mocked session");
  await page.send("Fetch.disable");
  verify(exceptions.length === 0, `Browser runtime exceptions: ${exceptions.join('\n')}`);
  console.log(JSON.stringify({ result: "passed", assertions, screenshots: ["swim-map.png", "swim-settings.png"], note: "Uses isolated practice; no live Neon writes." }, null, 2));
} catch (error) {
  if (page) { try { await capture("swim-failure.png"); } catch { /* Preserve original failure. */ } }
  console.error(`SWIM CHECK FAILED: ${error.message}`);
  if (exceptions.length) console.error(exceptions.join("\n"));
  process.exitCode = 1;
} finally {
  if (browser && context) await browser.send("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {});
  page?.close();
  browser?.close();
}

