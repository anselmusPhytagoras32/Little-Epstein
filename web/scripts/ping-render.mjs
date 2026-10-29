const configuredUrl = process.env.WEB_URL;

if (!configuredUrl) {
  throw new Error('Set WEB_URL to the deployed Render web service URL.');
}

const webUrl = new URL(configuredUrl);
const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(webUrl.hostname);

if (webUrl.protocol !== 'https:' && !(webUrl.protocol === 'http:' && isLoopback)) {
  throw new Error('WEB_URL must use HTTPS, except for a loopback URL during local checks.');
}

const response = await fetch(new URL('/', webUrl.origin), {
  signal: AbortSignal.timeout(20000),
  headers: { 'user-agent': 'escape-the-epstein-render-keepalive/1.0' },
});

if (!response.ok) {
  throw new Error(`Keep-alive request failed with HTTP ${response.status}.`);
}

console.log(`Render keep-alive succeeded with HTTP ${response.status} for ${webUrl.host}.`);
