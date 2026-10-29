import assert from 'node:assert/strict';

const app = process.env.APP_URL || 'http://127.0.0.1:3000';
const debug = process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9223';
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class CDP {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.pending = new Map();
    this.sequence = 0;
    this.ready = new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const task = this.pending.get(message.id);
      this.pending.delete(message.id);
      clearTimeout(task.timer);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
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
  close() { this.socket.close(); }
}

const waitFor = async (page, expression, label) => {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    const result = await page.send('Runtime.evaluate', { expression, returnByValue: true });
    if (result.result.value) return;
    await sleep(75);
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const click = async (page, selector) => {
  const result = await page.send('Runtime.evaluate', {
    expression: `(() => {const element=document.querySelector(${JSON.stringify(selector)});if(!element)throw Error('Missing ${selector}');element.scrollIntoView({block:'center'});const rect=element.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`,
    returnByValue: true,
  });
  const { x, y } = result.result.value;
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

let browser;
let page;
let context;
try {
  const version = await (await fetch(`${debug}/json/version`)).json();
  browser = new CDP(version.webSocketDebuggerUrl);
  ({ browserContextId: context } = await browser.send('Target.createBrowserContext', { disposeOnDetach: true }));
  const { targetId } = await browser.send('Target.createTarget', { url: app, browserContextId: context });
  let target;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const targets = await (await fetch(`${debug}/json/list`)).json();
    target = targets.find(item => item.id === targetId);
    if (target?.webSocketDebuggerUrl) break;
    await sleep(50);
  }
  assert.ok(target?.webSocketDebuggerUrl, 'isolated Chrome page is available');
  page = new CDP(target.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');

  await waitFor(page, "!!document.querySelector('.onboarding-progress')", 'first-visit onboarding');
  let result = await page.send('Runtime.evaluate', { expression: "document.querySelector('.onboarding-progress').getAttribute('aria-valuenow')", returnByValue: true });
  assert.equal(result.result.value, '1', 'welcome is the first step');
  await click(page, '.onboarding-primary');
  await waitFor(page, "document.querySelector('#onboarding-title')?.textContent.includes('How will you escape?')", 'play-style choice');
  result = await page.send('Runtime.evaluate', { expression: "({choices:document.querySelectorAll('.onboarding-choice').length,step:document.querySelector('.onboarding-progress').getAttribute('aria-valuenow')})", returnByValue: true });
  assert.deepEqual(result.result.value, { choices: 2, step: '2' }, 'solo and crew choices appear on step two');
  await click(page, '.onboarding-choice');
  await waitFor(page, "document.querySelector('#onboarding-title')?.textContent.includes('Make it yours.')", 'optional account step');
  await click(page, '.onboarding-later');
  await waitFor(page, "location.pathname === '/' && !document.querySelector('.onboarding') && !!document.querySelector('.escape-screen')", 'local practice after deferring account creation');
  result = await page.send('Runtime.evaluate', { expression: "!!document.querySelector('.dock-primary-cta')", returnByValue: true });
  assert.equal(result.result.value, true, 'practice island presents its daily action');
  console.log('Onboarding progress, solo/crew choice, and deferred-account practice flow passed.');
} finally {
  if (browser && context) await browser.send('Target.disposeBrowserContext', { browserContextId: context });
  page?.close();
  browser?.close();
}
