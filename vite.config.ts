import { defineConfig, loadEnv, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import { coffees, getInboxCopy, getStatus, sendFollowUp, type Env } from './server/mail';

// Serves /api/* from the dev and preview servers. The useSend key stays here.
function mailApi(mode: string) {
  const raw = loadEnv(mode, process.cwd(), 'USESEND_');
  const env: Env = {
    apiUrl: raw.USESEND_API_URL || 'http://localhost:3200',
    apiKey: raw.USESEND_API_KEY,
    from: raw.USESEND_FROM,
    inboxUrl: raw.USESEND_SES_INBOX_URL,
  };
  const sent = new Map<string, number>(); // simple per-IP rate limit
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return next();
    const send = (status: number, body: unknown) => {
      res.statusCode = status;
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(body));
    };
    if (!env.apiKey || !env.from) return send(503, { error: 'Email is not configured.' });

    if (url.pathname === '/api/send' && req.method === 'POST') {
      let body = '';
      req.on('data', c => (body += c));
      req.on('end', () => {
        let input: { name?: string; email?: string; coffee?: string };
        try { input = JSON.parse(body); } catch { return send(400, { error: 'Invalid request.' }); }
        const name = String(input.name ?? '').slice(0, 60).trim();
        const email = String(input.email ?? '').trim();
        const coffee = String(input.coffee ?? '');
        if (!name) return send(400, { error: 'Please enter your name.' });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(400, { error: 'Please enter a valid email.' });
        if (!coffees[coffee]) return send(400, { error: 'Please pick a coffee.' });
        const ip = req.socket.remoteAddress ?? '';
        const now = Date.now();
        if (now - (sent.get(ip) ?? 0) < 5000) return send(429, { error: 'Please wait a few seconds.' });
        sent.set(ip, now);
        sendFollowUp(env, { name, email, coffee }).then(r => send(200, r), () => send(502, { error: 'Could not send the email.' }));
      });
      return;
    }
    const id = url.searchParams.get('id') ?? '';
    if (url.pathname === '/api/status' && id) {
      return void getStatus(env, id).then(r => send(200, r), () => send(502, { error: 'Status unavailable.' }));
    }
    if (url.pathname === '/api/inbox' && id) {
      return void getInboxCopy(env, id).then(r => send(r ? 200 : 404, r ?? { error: 'Not captured yet.' }), () => send(502, { error: 'Inbox unavailable.' }));
    }
    send(404, { error: 'Not found.' });
  };
  return {
    name: 'demo-mail-api',
    configureServer: (server: { middlewares: Connect.Server }) => { server.middlewares.use(handler); },
    configurePreviewServer: (server: { middlewares: Connect.Server }) => { server.middlewares.use(handler); },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), mailApi(mode)],
  server: { host: '127.0.0.1', port: 5181, strictPort: true },
  preview: { host: '127.0.0.1', port: 5181, strictPort: true },
}));
