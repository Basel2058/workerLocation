# OnSite sales demo

A 3-minute guided, clickable story for business owners, in Arabic, Hebrew and English. On every screen there is
one thing to press; the visitor feels they are trying the app, but nothing can go wrong.

It is a **static site**: plain files, no server, no database, no login, all data invented. It shares nothing with the
real app (its own `package.json`, its own build), so changing it cannot break the app, and the app's Docker image
leaves this folder out.

## The story

| # | Screen | Purpose |
|---|---|---|
| 1 | Language | Arabic / Hebrew / English |
| 2 | Hook | "7:00 in the morning. Do you know which of your workers actually arrived?" over a city where workers walk to work |
| 3 | Your business | Company name, number of workers, field: the rest of the demo uses them |
| 4 | Lost money | Minutes lost per worker per day × workers × 22 days × pay per hour (default ₪50) |
| 5–10 | Six phone scenes | Check in · the manager sees it · from home (refused) · a friend checks in (caught) · call a late worker · hours for payroll |
| 11 | Before / after | |
| 12 | No headaches | No install, 3 languages, privacy, ready in a day |
| 13 | Start | "I want to start" opens WhatsApp to +972 52-603-7363 with company, workers and field filled in |

Presenter tricks:

- **Tap the logo three times** (top corner) to jump to any screen.
- Send a link that skips the language screen: `…/?lang=ar`, `?lang=he` or `?lang=en`.
- The speaker icon turns the sounds off.

Texts are all in `src/i18n.ts`; the WhatsApp number is `WHATSAPP` in `src/scenes/pages.tsx`.

## Run and build

```bash
cd demo
npm install
npm run dev      # http://localhost:5180
npm run build    # static files in demo/dist
```

## Publish on Cloudflare Pages (free)

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → pick this repository.
2. Settings:
   - **Production branch:** the branch with the demo
   - **Framework preset:** None (or Vite)
   - **Root directory:** `demo`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. **Save and Deploy.** The demo is live at `https://<project>.pages.dev` and updates by itself on every push.
4. Optional: **Custom domains** → e.g. `demo.yourcompany.co.il`.
