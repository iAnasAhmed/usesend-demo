# Kiln Follow-up: useSend demo

A standalone demo of a post-purchase follow-up email sent through a **self-hosted useSend**.

- Place a pretend order and a personalised email goes out through the useSend API.
- A live timeline shows **Accepted → Sent → Delivered**, using useSend's delivery events.
- In local dev, the exact email captured by the SES emulator is shown in an inbox preview.
- The API key stays on the server (`/api/send`, `/api/status`, `/api/inbox`); input is validated and rate-limited.

## Run

1. Run useSend locally (its `docker/dev` stack plus the web app). Create a team, a verified domain and a **Sending** API key.
2. Copy `.env.example` to `.env.local` and fill in the key and from-address.
3. `npm install` then `npm run dev`. Open http://127.0.0.1:5181.

Demo only: no real orders, and in local dev no email reaches a real inbox.
