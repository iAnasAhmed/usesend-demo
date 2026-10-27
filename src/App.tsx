import { useEffect, useState, type FormEvent } from 'react';

const coffees = ['Yirgacheffe', 'Huila', 'Nyeri AA', 'Cerrado'];
type Event = { status: string; at: string };

const steps = [
  { key: 'ACCEPTED', label: 'Accepted by useSend', hint: 'API call returned an email ID' },
  { key: 'SENT', label: 'Sent', hint: 'Handed to the mail server (SES)' },
  { key: 'DELIVERED', label: 'Delivered', hint: 'Confirmed by the delivery webhook' },
];
const bad = ['BOUNCED', 'REJECTED', 'FAILED', 'COMPLAINED', 'SUPPRESSED', 'RENDERING_FAILURE'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function App() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [coffee, setCoffee] = useState(coffees[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ id: string; subject: string; at: string } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [inbox, setInbox] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setEvents([]); setInbox(null);
    try {
      const r = await fetch('/api/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, email, coffee }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Something went wrong.');
      setSent({ id: j.id, subject: j.subject, at: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  // Poll delivery status and the captured copy until delivered (or 60 s).
  useEffect(() => {
    if (!sent) return;
    let alive = true;
    const started = Date.now();
    const tick = async () => {
      try {
        const s = await fetch(`/api/status?id=${encodeURIComponent(sent.id)}`).then(r => r.json());
        if (alive && s.events) setEvents(s.events);
        const i = await fetch(`/api/inbox?id=${encodeURIComponent(sent.id)}`);
        if (alive && i.ok) setInbox((await i.json()).html);
        const done = s.events?.some((e: Event) => e.status === 'DELIVERED' || bad.includes(e.status));
        if (alive && !done && Date.now() - started < 60000) timer = window.setTimeout(tick, 1500);
      } catch {
        if (alive && Date.now() - started < 60000) timer = window.setTimeout(tick, 3000);
      }
    };
    let timer = window.setTimeout(tick, 600);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [sent]);

  const reached = (key: string) => (key === 'ACCEPTED' ? (sent ? sent.at : null) : events.find(e => e.status === key)?.at ?? null);
  const failure = events.find(e => bad.includes(e.status));

  return (
    <>
      <header className="top">
        <a className="logo" href="#">Kiln<span>.</span></a>
        <span className="tag">Follow-up email demo</span>
      </header>

      <main className="wrap">
        <section className="intro">
          <p className="eyebrow">Post-purchase follow-up</p>
          <h1>The thank-you email,<br /><em>sent from my own server.</em></h1>
          <p className="lead">Place a pretend order and a personalised follow-up goes out through a self-hosted useSend. Watch it move from accepted to delivered, then read the exact email that left the server.</p>
        </section>

        <div className="grid">
          <form className="card form" onSubmit={submit} noValidate>
            <h2>Your pretend order</h2>
            <label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Anas" autoComplete="given-name" required maxLength={60} /></label>
            <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></label>
            <fieldset>
              <legend>Coffee</legend>
              <div className="chips">
                {coffees.map(c => (
                  <label key={c} className={`chip ${coffee === c ? 'on' : ''}`}>
                    <input type="radio" name="coffee" value={c} checked={coffee === c} onChange={() => setCoffee(c)} />{c}
                  </label>
                ))}
              </div>
            </fieldset>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" disabled={busy}>{busy ? 'Sending…' : 'Place order & send follow-up'}</button>
            <p className="fine">Local demo: emails are caught by a test mail server and never reach a real inbox.</p>
          </form>

          <section className="card" aria-live="polite">
            <h2>Delivery</h2>
            {!sent ? (
              <p className="muted">Nothing sent yet. Fill in the form to start.</p>
            ) : (
              <>
                <p className="subject">“{sent.subject}”</p>
                <ol className="timeline">
                  {steps.map(s => {
                    const at = reached(s.key);
                    return (
                      <li key={s.key} className={at ? 'done' : 'wait'}>
                        <i aria-hidden="true" />
                        <div><b>{s.label}</b><small>{s.hint}</small></div>
                        <time>{at ? time(at) : '…'}</time>
                      </li>
                    );
                  })}
                  {failure && (
                    <li className="fail"><i aria-hidden="true" /><div><b>{failure.status.toLowerCase()}</b><small>Reported by the mail server</small></div><time>{time(failure.at)}</time></li>
                  )}
                </ol>
                <p className="id">Email ID <code>{sent.id}</code></p>
              </>
            )}
          </section>
        </div>

        {inbox && (
          <section className="card inbox">
            <div className="inbox-head">
              <h2>What landed in the inbox</h2>
              <span className="muted small">Captured by the local mail server</span>
            </div>
            <iframe title="Delivered email" sandbox="" srcDoc={inbox} />
          </section>
        )}
      </main>

      <footer className="foot">
        <p>Built by <a href="https://github.com/iAnasAhmed" target="_blank" rel="noopener noreferrer">Anas Ahmed</a> · Email by a self-hosted useSend fork.</p>
      </footer>
    </>
  );
}
