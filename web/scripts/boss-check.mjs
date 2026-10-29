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

try {
  let response;
  try { response = await fetch(`${debug}/json/version`); } catch { throw new Error(`Chrome debugger unavailable at ${debug}`); }
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
  await page.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const observed = { drawnBoss: 0, drawnAvatar: 0, playerX: null, shots: 0, hazards: 0, sources: new Set(), listeners: { keydown: new Set(), keyup: new Set(), blur: new Set() } };
    window.__bossCheck = observed;
    const originalAdd = window.addEventListener, originalRemove = window.removeEventListener;
    window.addEventListener = function(type, listener, options) { if (observed.listeners[type]) observed.listeners[type].add(listener); return originalAdd.call(this, type, listener, options); };
    window.removeEventListener = function(type, listener, options) { if (observed.listeners[type]) observed.listeners[type].delete(listener); return originalRemove.call(this, type, listener, options); };
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function(...args) { const src=decodeURIComponent(args[0]?.src || ''); observed.sources.add(src); if(/(?:Kirk|Diddy|Epstein).*Sprite/i.test(src)) observed.drawnBoss++; if(src.includes('Pixel-Art Base')) { observed.drawnAvatar++; observed.playerX=args[5]; } return originalDraw.apply(this,args); };
    const originalArc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function(...args) { if(args[2]===5) observed.shots++; if(args[2]===11) observed.hazards++; return originalArc.apply(this,args); };
  })();` });
  const { bossStage, bossHealthFloor, getScaledBossHp, TARGET_RAID_DURATION_SECONDS } = await import(new URL("../app/boss/boss-rules.ts", import.meta.url));
  for (const [hp, expected] of [[2700, "human"], [1801, "human"], [1800, "transformed"], [901, "transformed"], [900, "enraged"], [1, "enraged"], [0, "defeated"]]) {
    verify(bossStage(hp) === expected, `Health ${hp} maps to the ${expected} phase`);
  }
  for (const [boss, seconds] of [["kirkify", 300], ["diddy", 600], ["epstein", 900]]) {
    const hp = getScaledBossHp(boss, 1);
    verify(getScaledBossHp(boss, 3) === hp * 3, `${boss} health scales with the actual player count`);
    verify(TARGET_RAID_DURATION_SECONDS[boss] === seconds && bossHealthFloor(hp, seconds - 1, seconds) > 0 && bossHealthFloor(hp, seconds, seconds) === 0, `${boss} cannot be defeated before its minimum duration`);
  }

  for (const [id, name, sprite] of [["kirkify", "Kirkify", "Kirk Sprite"], ["diddy", "Diddy", "Diddy Sprite"], ["epstein", "Epstein", "Epstein Sprite"]]) {
    await page.send("Page.navigate", { url: new URL(`/boss?opponent=${id}`, app).href });
    await waitFor(`document.readyState === 'complete' && document.querySelector('.boss-intro h1')?.textContent === ${JSON.stringify(`Face ${name}`)} && !!document.querySelector('.boss-start') && !document.querySelector('.boss-start').disabled`, `${name} and both sprite sheets`);
    verify(await evaluate("document.querySelector('.boss-squad-badge')?.textContent.includes('1 SWIMMER')"), `${name} encounter starts as solo practice`);
    verify(await evaluate("!document.querySelector('.boss-health.enemy') && !/boss (health|damage)|boss hp/i.test(document.querySelector('.boss-hud').textContent)"), `${name} boss health is hidden in the HUD`);
    verify(await evaluate("document.querySelector('.boss-screen').dataset.bossPhase === 'human'"), `${name} starts in human phase`);
    if (id === "kirkify") await capture("boss-ready.png");
    await click(".boss-start");
    await waitFor("!!document.querySelector('.boss-dialogue button')", `${name} dialogue`);
    await click(".boss-dialogue button");
    await waitFor(`!!document.querySelector('.boss-joystick') && !!document.querySelector('.boss-attack') && [...window.__bossCheck.sources].some(src => src.includes(${JSON.stringify(sprite)})) && window.__bossCheck.drawnAvatar > 0`, `${name} and the player sprites are drawn`);
    verify(await evaluate(`Array.from(window.__bossCheck.sources).some(src => src.includes(${JSON.stringify(sprite)}))`), `${name}'s actual sprite is rendered`);
    verify(await evaluate("!document.querySelector('.boss-health.enemy') && !/boss (health|damage)|boss hp/i.test(document.querySelector('.boss-hud').textContent)"), `${name} boss health remains hidden during play`);

    if (id !== "kirkify") continue;
    const squadBadgeText = await evaluate("document.querySelector('.boss-squad-badge')?.textContent");
    verify(squadBadgeText?.includes("1 SWIMMER"), "The squad badge confirms solo practice");
    verify(await evaluate("!!document.querySelector('.boss-aim')"), "The aim control is available");
    const initialX = await evaluate("window.__bossCheck.playerX");
    const stick = await rect(".boss-joystick");
    await press(stick.x, stick.y);
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: stick.x + stick.width * .35, y: stick.y, button: "left", buttons: 1 });
    await sleep(650);
    await release(stick.x + stick.width * .35, stick.y);
    const movedX = await evaluate("window.__bossCheck.playerX");
    verify(movedX > initialX + 30, `The joystick moves the swimmer (${initialX} to ${movedX})`);
    const attack = await rect(".boss-attack");
    await press(attack.x, attack.y);
    await waitFor("window.__bossCheck.shots > 0", "attack projectiles");
    await waitFor("window.__bossCheck.hazards > 0", "dodgeable boss projectiles");
    await release(attack.x, attack.y);
    verify(await evaluate("window.__bossCheck.shots > 0 && window.__bossCheck.hazards > 0"), "Player attacks and boss projectiles render");
    await capture("boss-playing.png");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await waitFor("getComputedStyle(document.querySelector('.boss-landscape')).transform !== 'none'", "portrait landscape fallback");
    const rotated = await evaluate("(() => {const r=document.querySelector('.boss-landscape').getBoundingClientRect();return {width:r.width,height:r.height,transform:getComputedStyle(document.querySelector('.boss-landscape')).transform}})()");
    verify(rotated.transform !== "none" && rotated.width >= 380 && rotated.height >= 830, "Portrait devices receive a rotated, full-screen landscape view");
    await capture("boss-portrait.png");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });

    // Set encounter state just above each threshold in an isolated browser.
    // Real attacks still have to collide to cross it; no production test hook is added.
    const found = await evaluate(`(() => {const canvas=document.querySelector('canvas');const key=Object.keys(canvas).find(k=>k.startsWith('__reactFiber'));let fiber=key&&canvas[key];while(fiber){let hook=fiber.memoizedState;while(hook){const ref=hook.memoizedState;if(ref?.current&&typeof ref.current.bossHp==='number'&&Array.isArray(ref.current.shots)){window.__battleFixture=ref.current;return true}hook=hook.next}fiber=fiber.return}return false})()`);
    verify(found, "The isolated test can set up damage thresholds without a production hook");
    verify(await evaluate("window.__battleFixture.squadCount === 1"), "Solo practice does not invent teammates");
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "j", code: "KeyJ" });
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space" });
    await waitFor("window.__battleFixture.shots.some(shot => shot.vx < -500)", "aimed shots travel left");
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "j", code: "KeyJ" });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
    for (const [hp, expected] of [[1804, "transformed"], [904, "enraged"], [4, "defeated"]]) {
      const landed = await evaluate(`(() => {const battle=window.__battleFixture;battle.maxBossHp=2700;battle.bossHp=${hp};battle.battleTimer=901;battle.hp=100;battle.invulnerable=30;battle.shots.push({x:battle.bossX,y:battle.bossY,vx:0,vy:0,damage:10});return battle.shotsLanded})()`);
      await waitFor(`document.querySelector('.boss-screen').dataset.bossPhase === ${JSON.stringify(expected)}`, `real attacks reach ${expected} phase`, 15000);
      verify(await evaluate(`window.__battleFixture.shotsLanded > ${landed}`), `An actual projectile lands to trigger ${expected}`);
      verify(await evaluate("!document.querySelector('.boss-health.enemy') && !/boss (health|damage)|boss hp/i.test(document.querySelector('.boss-hud').textContent)"), `Health stays hidden in ${expected} phase`);
    }
    await waitFor("document.querySelector('.boss-intro h1')?.textContent.includes('defeated') && !!document.querySelector('.boss-results')", "victory when boss health drops to 0");
    verify(await evaluate("!/boss (health|damage)|boss hp/i.test(document.querySelector('.boss-results').textContent)"), "The results do not reveal the boss's remaining health or damage percentage");
    await capture("boss-results.png");
    await click(".boss-start");
    await waitFor("!!document.querySelector('.boss-dialogue button')", "retry dialogue");
    await click(".boss-dialogue button");
    await waitFor("!!document.querySelector('.boss-joystick') && !document.querySelector('.boss-results')", "a new encounter after retry");
    verify(await evaluate("document.querySelector('.boss-squad-badge')?.textContent.includes('1 SWIMMER') && document.querySelector('.boss-health b').textContent === '100' && document.querySelector('.boss-screen').dataset.bossPhase === 'human'"), "Retry resets squad counter, player health, and boss phase");
  }
  await click(".boss-back");
  await waitFor("location.pathname === '/' && !document.querySelector('.boss-screen')", "leaving the encounter");
  verify(exceptions.length === 0, `Browser runtime exceptions: ${exceptions.join('\n')}`);
  console.log(JSON.stringify({ result: "passed", assertions, screenshots: ["boss-ready.png", "boss-playing.png", "boss-portrait.png", "boss-results.png"], note: "Uses isolated local practice and deterministic near-threshold state; does not test live multiplayer or full-length fights." }, null, 2));
} catch (error) {
  if (page) { try { await capture("boss-failure.png"); } catch { /* Preserve original failure. */ } }
  console.error(`BOSS CHECK FAILED: ${error.message}`);
  if (exceptions.length) console.error(exceptions.join("\n"));
  process.exitCode = 1;
} finally {
  if (browser && context) await browser.send("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {});
  page?.close();
  browser?.close();
}
