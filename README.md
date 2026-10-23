# OnSite — location-verified attendance

OnSite lets workers check in and out with their phone when they arrive at and leave the workplace.
Managers see at a glance who arrived and who didn't, where everyone checked in, and can call anyone with one tap.
You, the owner, run the platform: you create companies, managers and workers, fix mistakes and watch
whether everything is working.

It is a web app that installs on phones like a normal app (PWA) — no app store needed.
Available in **English, Arabic and Hebrew** (right-to-left layout included).

## What each person gets

**Workers** (phone)
- One big **Check in / Check out** button. The app finds their location, takes a quick selfie, and is done in a few seconds.
- Their shifts, worked hours and history. Nothing else.
- If they are outside the workplace they see how far away they are, and can send the check-in to their manager as a request (e.g. "working at the customer's site today").

**Managers** (phone or computer)
- **Live**: today's board — on site, not arrived, late, checked out, coming later — with a map and a call button on every person.
- **Requests**: approve new phones, confirm unusual check-ins, fix forgotten check-outs, see warnings about possible cheating.
- **Schedule**: plan shifts for a week (copy last week in one click).
- **Hours**: worked vs. planned hours, late arrivals, absences, CSV export for payroll, and corrections (always with a reason).
- **Presence check**: ask a checked-in worker to prove, right now, that they are still at work.

**You, the owner (developer role)**
- Companies, workplaces (pick the place and radius on a map), managers and workers. You create the accounts and get
  ready-to-send login details (copy or WhatsApp).
- Per-company rules: selfie always/random/never, GPS precision, late grace time, check-ins without shifts, photo retention…
- Health overview, background jobs, error log (server *and* workers' phones), security alerts, full change history,
  every check-in with its evidence (GPS readings, photo, phone, network), active sessions, one-click database backup.
- Open any company's manager dashboard to help or fix things — every change is logged under your name.

## Languages

- Everyone can switch between English, العربية and עברית: on the sign-in screen (top corner), on the worker's
  **Me** page and in **Account settings**. The choice is saved on the account, so check-in results, error messages,
  alerts, change history, push notifications and CSV exports all come in that language.
- New phones start in the phone's own language. The owner can also pick a language for each account when creating it,
  and set a default language per company (used for login messages sent on WhatsApp and for notifications to people who
  never chose one).
- Arabic and Hebrew use a right-to-left layout and Western digits (0-9). Each company also sets the first day of the
  week (Sunday, Monday or Saturday) for schedules and weekly hours.
- Translators: see `web/src/i18n/README.md` (guide and glossary) and `server/src/i18n/` (server texts). The tests fail
  when a server text has no Arabic or Hebrew translation.

## How cheating is prevented

Workers will try. Each trick is covered by more than one layer:

| Trick | What stops it |
|---|---|
| Giving the password to a coworker | Check-ins are signed by a **key that lives only on the worker's own phone** (a non-extractable WebCrypto key). A password alone is useless on another phone. A new phone needs the manager's approval, which retires the old one. |
| Coworker signs in on *their own* phone as the absent worker | The phone already belongs to the coworker → refused, and the manager gets a **"Password shared?"** alert naming both people. Also caught when the browser keeps a cookie from the other worker. |
| Giving the phone itself to a coworker | **Live selfie** with every check-in (front camera stream, not the gallery), shown to the manager. Reused photos are detected. |
| Fake GPS apps / spoofed location | The app takes several readings and the server looks for fake-GPS fingerprints: impossible accuracy, perfectly frozen positions, typed-in coordinates, a position exactly on the site's pin, identical coordinates to a coworker, impossible travel, jumps between readings. Suspicious check-ins go to the manager (or are rejected — your choice per company). |
| Browser tricks (extensions, developer tools, emulators, automation) | The phone reports whether its location feature is original, whether it is automated, and whether it is really a phone; mismatches raise the risk score. |
| Changing the phone's clock | All times come from the server. |
| Replaying or editing a request | Every check-in uses a fresh one-time code from the server and is signed; tampered or repeated requests are rejected and logged. |
| Checking in and going home | Must check out from the workplace too; managers can send **presence checks** (push notification, 15 minutes to answer from the workplace). Forgotten check-outs are flagged and don't count until fixed. |
| Checking in from the parking lot early | Geofence radius per workplace; early check-ins only count from a configurable window before the shift. |
| Weak GPS indoors | Optional **workplace Wi-Fi addresses**: being on the workplace internet confirms presence (and can be required). |

Workers never see *why* a check-in was flagged, so they cannot learn to dodge the checks. Managers see plain-language
explanations. Every correction requires a reason and goes into the change history.

> A web app cannot read Android's "mock location" flag, so a very determined, technical person could still try
> something. The selfie, the per-phone key, manager review and the alerts make that slow, visible and risky.

## Run it locally

Requirements: Node.js 22.12+.

```bash
npm install
npm run seed:demo        # optional: a demo company with people, shifts and today's activity
npm run dev              # API on :3000, app on http://localhost:5173
```

Demo logins (after `seed:demo`): owner `developer` / `developer123`, manager `demo.manager` / `manager123`,
workers `omar`, `aisha`, … / `worker123`. The demo workplaces are in central London; to try a real check-in on your
phone, seed with your own location: `DEMO_LAT=… DEMO_LNG=… DEMO_TZ=Asia/Amman npm run seed:demo -- --reset`,
or add a workplace at your location in the owner console (**Companies → Workplaces → Add → I'm here**).

Location, camera and the phone key only work on **https** or `localhost`. To test on a phone, deploy (below) or run
the built app and open it through a tunnel: `npm run build && npm start`, then
`cloudflared tunnel --url http://localhost:3000`.

Without the demo, the first start creates the owner account and prints its one-time password in the server output.

## Deploy

### Free: Oracle Cloud "Always Free" server + free DuckDNS address

Costs nothing, runs 24/7 and keeps its data. Oracle's free ARM server is far stronger than this app needs.

1. **Account:** sign up at oracle.com/cloud/free (a card is needed for identity checks; Always Free use is not charged).
   Pick the **home region closest to your workers** (e.g. Jerusalem, Dubai, Jeddah, Frankfurt) — it cannot be changed.
   Optional but recommended: upgrade the account to *Pay As You Go* (still free within Always Free limits; protects
   the server from being reclaimed as "idle") and set a **budget alert of $1** under Billing → Budgets.
2. **Server:** Compute → Instances → Create: image **Ubuntu 24.04**, shape **Ampere (VM.Standard.A1.Flex)** with
   1–2 OCPU and 6–12 GB RAM, and add your SSH key. ("Out of capacity"? Try again later or another availability domain.)
3. **Open the web ports:** in the instance's subnet → Security List → add ingress rules for TCP **80** and **443**
   from `0.0.0.0/0`. Then on the server (Oracle's Ubuntu also blocks them inside):

   ```bash
   sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -j ACCEPT && sudo netfilter-persistent save
   ```
4. **Address:** at duckdns.org, sign in, create e.g. `mycompany` and set it to the server's public IP → your app will
   be `https://mycompany.duckdns.org`.
5. **App:**

   ```bash
   curl -fsSL https://get.docker.com | sh
   git clone <this repository> onsite && cd onsite
   cp .env.example .env     # DOMAIN=mycompany.duckdns.org, BOOTSTRAP_DEV_PASSWORD, CONTACT_EMAIL
   sudo docker compose up -d
   ```
   Caddy gets the HTTPS certificate by itself. Open the address and sign in as `developer`.

Other free choice: Google Cloud's always-free **e2-micro** (US regions only, 1 GB RAM, 1 GB outgoing traffic a month)
works the same way with the steps 4–5 above; add swap before building (`sudo fallocate -l 2G /swapfile && sudo
chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`). Avoid free plans that sleep or have no
permanent disk (Render, Koyeb, Railway trial…): the app would lose its data or miss its background jobs.

### Recommended paid setup: a small server + Cloudflare Tunnel

Cloudflare gives the app its HTTPS address for free and the server opens no ports to the internet.

1. **Server:** rent a small Linux server (Ubuntu, 1 vCPU / 1 GB RAM is plenty for hundreds of workers) and install
   Docker: `curl -fsSL https://get.docker.com | sh`.
2. **Domain:** add your domain to Cloudflare (free plan) and use Cloudflare's name servers.
3. **Tunnel:** in Cloudflare, open **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared**. Copy the token
   from the install command (the long text after `--token`). Under **Public hostname**, add e.g. `onsite.yourcompany.com`
   with service **HTTP** and URL **`app:3000`**.
4. **App:** on the server:

   ```bash
   git clone <this repository> onsite && cd onsite
   cp .env.example .env     # set TUNNEL_TOKEN, CONTACT_EMAIL and BOOTSTRAP_DEV_PASSWORD
   docker compose -f docker-compose.cloudflare.yml up -d
   ```
5. Open `https://onsite.yourcompany.com` and sign in as `developer` with the password from `.env`.

Update later with `git pull && docker compose -f docker-compose.cloudflare.yml up -d --build`. Keep a copy of the
backups off the server: download one from the owner console now and then, or copy `/data/backups`.

### Alternative: Docker with Caddy (no Cloudflare)

Caddy gets a free HTTPS certificate automatically; the server needs ports 80 and 443 open.

1. Get a small Linux server (1 vCPU / 1 GB RAM is plenty for hundreds of workers) and point a domain name at it.
2. Install Docker, copy this repository to the server, then:

   ```bash
   cp .env.example .env     # set DOMAIN, CONTACT_EMAIL and BOOTSTRAP_DEV_PASSWORD
   docker compose up -d
   ```
3. Open `https://your-domain` and sign in as `developer`.

All data lives in the `onsite-data` Docker volume (`/data`): one SQLite database (with photos) plus daily backups in
`/data/backups` (last 7 kept). You can also download a backup any time from the owner console.

Without Docker: `npm ci && npm run build && NODE_ENV=production node dist/server/index.js` behind any HTTPS reverse
proxy (nginx, Caddy, a PaaS). Set `TRUST_PROXY=1` when exactly one proxy sits in front.

### Setting up a company

1. **Companies → New company** (name + time zone).
2. **Workplaces → Add workplace**: search the address or stand there and tap **I'm here**, set the radius
   (100–200 m suits most sites). Optionally add the workplace Wi-Fi address.
3. **People → Add manager / Add worker** — send each person their login details (the dialog has **Send on WhatsApp**).
4. Workers open the link on their phone, sign in (iPhone: add to Home Screen first, the app shows how) and are ready.
   Their first phone is approved automatically.
5. The manager plans shifts under **Schedule**.

### Configuration

| Variable | Default | |
|---|---|---|
| `PORT`, `HOST` | `3000`, `0.0.0.0` | |
| `DATA_DIR` | `./data` | Database, backups |
| `APP_NAME` | `OnSite` | Shown in the app and on home screens |
| `TRUST_PROXY` | off | `1` behind one reverse proxy. **Never enable it when the app is reachable directly** — workers could fake their network address. |
| `COOKIE_SECURE` | on in production | |
| `BOOTSTRAP_DEV_USERNAME` / `BOOTSTRAP_DEV_PASSWORD` | `developer` / random | First owner account (first start only) |
| `CONTACT_EMAIL` | | Contact for the address search service and push notifications |
| `MAP_TILE_URL`, `MAP_ATTRIBUTION` | OpenStreetMap | Map tiles; for heavy use pick a tile provider |
| `BACKUP_KEEP` | `7` | Daily backups to keep (0 = off) |

### Monitoring and maintenance

- `GET /healthz` returns 200 while the app and database work — point an uptime monitor (UptimeRobot, Better Stack…) at it.
- The owner console's **Overview** shows health checks, background jobs, errors and activity; **System log** collects
  server errors and errors from people's browsers.
- Locked out? On the server: `docker compose exec app node dist/server/cli.js reset-password developer`
  (also `create-developer <name>` and `unlock <name>`; locally: `npm run cli -- …`).

## Development

```bash
npm run typecheck   # server + web
npm test            # server unit and API tests (Vitest)
npm run test:e2e    # browser tests (Playwright) — builds and starts the app with demo data
npm run build
```

Code layout: `server/src` (Fastify API, SQLite, anti-cheat in `services/risk.ts` and `services/punch.ts`),
`web/src` (React + Tailwind; `pages/worker`, `pages/manager`, `pages/dev`), `shared/` (types used by both),
`scripts/` (dev runner, demo data, icons).
