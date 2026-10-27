// Talks to the self-hosted useSend API. The API key never leaves the server.
export type Env = { apiUrl: string; apiKey: string; from: string; inboxUrl?: string };

export const coffees: Record<string, { origin: string; notes: string; brew: string }> = {
  Yirgacheffe: { origin: 'Ethiopia', notes: 'jasmine, bergamot and peach', brew: 'a pour-over at 93°C, 1:16 ratio' },
  Huila: { origin: 'Colombia', notes: 'red apple, caramel and cocoa', brew: 'an AeroPress, 2-minute steep' },
  'Nyeri AA': { origin: 'Kenya', notes: 'blackcurrant and grapefruit', brew: 'a V60 with a slightly finer grind' },
  Cerrado: { origin: 'Brazil', notes: 'hazelnut and milk chocolate', brew: 'espresso, or a French press for 4 minutes' },
};

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildEmail(name: string, coffee: string) {
  const c = coffees[coffee] ?? coffees.Yirgacheffe;
  const first = esc(name.trim().split(/\s+/)[0] || 'there');
  const subject = `${first}, your ${coffee} is on its way`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f1e8;font-family:Georgia,serif;color:#1f1c18">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
  <p style="font:700 26px Georgia,serif;margin:0 0 24px">Kiln<span style="color:#b5651d">.</span></p>
  <h1 style="font:400 30px/1.15 Georgia,serif;margin:0 0 16px">Thanks, ${first}. Your ${esc(coffee)} is roasting.</h1>
  <p style="font:16px/1.6 system-ui,sans-serif;color:#4a443c">This single origin from ${c.origin} tastes of ${c.notes}. We roast every Monday, so it ships fresh this week.</p>
  <div style="background:#fffdf7;border:1px solid #e2dbcd;border-radius:14px;padding:18px;margin:24px 0">
    <p style="font:600 12px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#b5651d;margin:0 0 8px">How to brew it</p>
    <p style="font:16px/1.5 system-ui,sans-serif;margin:0">Try ${c.brew}. Rest the beans 3–5 days after roasting for the sweetest cup.</p>
  </div>
  <p style="font:14px/1.6 system-ui,sans-serif;color:#6b645a">Questions? Just reply to this email.<br>— The Kiln team</p>
  <p style="font:12px system-ui,sans-serif;color:#9a9286;margin-top:32px">Demo email sent by a self-hosted useSend. No real order was placed.</p>
</div></body></html>`;
  const text = `Thanks, ${first}. Your ${coffee} is roasting.\n\nIt tastes of ${c.notes}. Try ${c.brew}.\n\nDemo email sent by a self-hosted useSend.`;
  return { subject, html, text };
}

async function api(env: Env, path: string, init?: RequestInit) {
  const res = await fetch(new URL(path, env.apiUrl), {
    ...init,
    headers: { authorization: `Bearer ${env.apiKey}`, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`useSend ${res.status}`);
  return res.json();
}

export async function sendFollowUp(env: Env, input: { name: string; email: string; coffee: string }) {
  const { subject, html, text } = buildEmail(input.name, input.coffee);
  const r = (await api(env, '/api/v1/emails', {
    method: 'POST',
    body: JSON.stringify({ to: input.email, from: env.from, subject, html, text }),
  })) as { emailId: string };
  return { id: r.emailId, subject };
}

export async function getStatus(env: Env, id: string) {
  const r = (await api(env, `/api/v1/emails/${encodeURIComponent(id)}`)) as {
    emailEvents?: { status: string; createdAt: string }[];
  };
  const events = (r.emailEvents ?? []).map(e => ({ status: e.status, at: e.createdAt }));
  events.sort((a, b) => a.at.localeCompare(b.at));
  return { events };
}

// Dev only: read the message the local SES emulator captured, to prove it really went out.
export async function getInboxCopy(env: Env, id: string) {
  if (!env.inboxUrl) return null;
  const res = await fetch(new URL('/api/emails', env.inboxUrl), { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return null;
  const { emails } = (await res.json()) as { emails: { Content?: { Raw?: { Data?: string } } }[] };
  for (const e of emails) {
    const raw = Buffer.from(e.Content?.Raw?.Data ?? '', 'base64').toString('utf8');
    if (!raw.includes(`X-Usesend-Email-ID: ${id}`)) continue;
    return { html: extractHtml(raw) };
  }
  return null;
}

function extractHtml(raw: string) {
  const parts = raw.split(/\r?\n--[^\r\n]+\r?\n/);
  for (const part of [...parts, raw]) {
    const m = part.match(/Content-Type: text\/html[^\r\n]*(?:\r?\n[^\r\n]+)*\r?\n\r?\n([\s\S]*)/i);
    if (!m) continue;
    let body = m[1].replace(/\r?\n--[^\r\n]*--\s*$/, '');
    const enc = part.match(/Content-Transfer-Encoding: (\S+)/i)?.[1]?.toLowerCase();
    if (enc === 'base64') body = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (enc === 'quoted-printable') {
      body = Buffer.from(
        body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))),
        'latin1',
      ).toString('utf8');
    }
    return body;
  }
  return '';
}
