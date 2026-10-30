import assert from "node:assert/strict";

const app = new URL(process.env.APP_URL || "http://127.0.0.1:3000");
const debug = process.env.CHROME_DEBUG_URL || "http://127.0.0.1:9223";
if (!["localhost", "127.0.0.1"].includes(app.hostname)) throw new Error("Use an isolated local application.");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
class CDP {
  constructor(url) {
    this.socket = new WebSocket(url); this.pending = new Map(); this.id = 0;
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
    this.socket.addEventListener("message", event => { const message = JSON.parse(event.data), task = this.pending.get(message.id); if (!task) return; this.pending.delete(message.id); clearTimeout(task.timer); if (message.error) task.reject(new Error(message.error.message)); else task.resolve(message.result); });
  }
  async send(method, params = {}) { await this.ready; return new Promise((resolve, reject) => { const id = ++this.id, timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome timed out: ${method}`)); }, 15000); this.pending.set(id, { resolve, reject, timer }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  close() { this.socket.close(); }
}
let browser, page, context;
async function evaluate(expression) { const result = await page.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; }
async function waitFor(expression, label) { for (let i = 0; i < 200; i++) { try { if (await evaluate(expression)) return; } catch (error) { if (!/context|navigat|destroyed/i.test(error.message)) throw error; } await sleep(75); } throw new Error(`Timed out waiting for ${label}`); }
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`); await sleep(80); const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`); await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 }); await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 }); }

try {
  browser = new CDP((await (await fetch(`${debug}/json/version`)).json()).webSocketDebuggerUrl);
  ({ browserContextId: context } = await browser.send("Target.createBrowserContext", { disposeOnDetach: true }));
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: context });
  let target;
  for (let i = 0; i < 30; i++) { target = (await (await fetch(`${debug}/json/list`)).json()).find(item => item.id === targetId); if (target?.webSocketDebuggerUrl) break; await sleep(50); }
  assert.ok(target?.webSocketDebuggerUrl);
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const roomId='11111111-1111-4111-8111-111111111111';
    const players=[{id:'self',name:'You',avatarId:'fern',avatarAccent:'sea',x:480,y:440,alive:true,self:true,attacking:false,aimX:0,aimY:-1,damageTotal:0},{id:'crew',name:'Teammate',avatarId:'fern',avatarAccent:'sea',x:260,y:350,alive:true,self:false,attacking:true,aimX:0,aimY:-1}];
    window.__crewCheck={tracers:0,heartbeats:[],positions:[],remoteX:260,attacking:true};let raidPhase='waiting';
    const originalArc=CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc=function(...args){if(args[2]===4&&this.fillStyle==='#bfe5cf')window.__crewCheck.tracers++;return originalArc.apply(this,args)};
    const originalDraw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){if(args[0]?.src?.includes('Pixel-Art')&&args[6]===305){window.__crewCheck.positions.push(args[5]);if(window.__crewCheck.positions.length>300)window.__crewCheck.positions.shift()}return originalDraw.apply(this,args)};
    const originalFetch=window.fetch;
    window.fetch=async function(input,init){const url=new URL(typeof input==='string'?input:input.url,location.href);
      if(url.pathname==='/api/session')return Response.json({user:{username:'Tester',avatarId:'fern',avatarAccent:'sea',timezone:'UTC'},room:{id:roomId,name:'Test crew',timezone:'UTC',phase:'active',checkedInDays:[],players:[{id:'self',username:'Tester',status:'alive',self:true,checkedIn:false,streak:0,progress:0}]}});
      if(url.pathname==='/api/room/feed')return Response.json({events:[]});
      if(url.pathname==='/api/boss/lobby'){const data=JSON.parse(init.body);if(data.operation==='heartbeat')window.__crewCheck.heartbeats.push(data);if(data.operation==='start')raidPhase='playing';players[1].attacking=window.__crewCheck.attacking;players[1].x=window.__crewCheck.remoteX;return Response.json({lobby:{opponent:'kirkify',phase:raidPhase,hp:30000,maxHp:30000,bossX:480,bossY:130,startedAt:new Date().toISOString(),host:true,players}})};
      return originalFetch.apply(this,arguments);
    };
  })();` });
  await page.send("Page.navigate", { url: new URL("/boss", app).href });
  await waitFor("!!document.querySelector('.raid-join') && !!document.querySelector('.boss-start') && !document.querySelector('.boss-start').disabled", "online boss lobby");
  await click(".raid-join");
  await waitFor("!!document.querySelector('.raid-lobby') && !document.querySelector('.boss-start').disabled", "joined lobby");
  await click(".boss-start");
  await waitFor("!!document.querySelector('.boss-dialogue-btn')", "fight dialogue");
  await click(".boss-dialogue-btn");
  await waitFor("window.__crewCheck.tracers > 3", "teammate attack tracers");
  await evaluate("window.__crewCheck.positions = []; window.__crewCheck.remoteX = 500");
  await waitFor("window.__crewCheck.positions.some(x => x > 250 && x < 450)", "smoothed movement between teammate snapshots");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space" });
  await waitFor("window.__crewCheck.heartbeats.some(item => item.attacking === true && item.aimY < 0)", "local attack heartbeat");
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space" });
  await waitFor("window.__crewCheck.heartbeats.at(-1)?.attacking === false", "released attack heartbeat");
  await evaluate("window.__crewCheck.attacking = false");
  await waitFor("window.__crewCheck.heartbeats.length > 3", "stopped teammate heartbeat");
  await sleep(1300);
  const before = await evaluate("window.__crewCheck.tracers");
  await sleep(300);
  assert.equal(await evaluate("window.__crewCheck.tracers"), before, "Remote tracers stop when the teammate releases attack");
  console.log("Crew attack tracers and local attack heartbeats passed in an isolated browser.");
} catch (error) { console.error(`BOSS CREW CHECK FAILED: ${error.message}`); if (page) console.error(await evaluate("({phase:document.querySelector('.boss-screen')?.dataset.bossPhase,button:document.querySelector('.boss-start')?.textContent,lobby:!!document.querySelector('.raid-lobby'),dialogue:!!document.querySelector('.boss-dialogue'),error:document.querySelector('.boss-error')?.textContent,heartbeats:window.__crewCheck?.heartbeats.length})").catch(() => null)); process.exitCode = 1; }
finally { if (browser && context) await browser.send("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {}); page?.close(); browser?.close(); }
