# CLAUDE.md

Working agreement for this repo. Read `docs/spec.md` for the full product spec — this file is the operational rules.

---

## What this is

A personal-first cooking log PWA. Each person (Sahil, Pierce, Vishal) owns their own private log on iPhone, installed to home screen. Photo + voice note in, structured searchable archive out. Sharing is an opt-in overlay: you can let someone *view* your log (asymmetric, like following), and when you cook with someone you can log a *co-cook* — one entry that appears in both feeds. Default state is fully private: no shares, no co-cooks, visible to one person. Invite-only, no public sign-up.

**The single governing constraint: capture must take under 20 seconds from unlock to phone back in pocket.** Any change that makes capture slower is wrong, regardless of what it adds. If a feature and capture speed conflict, capture wins.

---

## Stack

- Next.js (App Router), TypeScript, strict mode
- Supabase — Postgres, Storage, Auth (magic link, invite-only), Realtime, pgvector
- Vercel hosting
- DeepSeek API — **server-side only**, `deepseek-flash` (vision) for enrichment
- Voyage AI for embeddings
- Tailwind

## Commands

```bash
npm run dev          # local
npm run build        # verify before every deploy
npx supabase db push # apply migrations
```

---

## Architecture rules

**Never break these without asking:**

1. **The API key never reaches the client.** All Claude calls go through `/api/*` route handlers. No exceptions, not even for a quick test.
2. **Capture writes to IndexedDB before touching the network.** A save must succeed with the device in airplane mode.
3. **Enrichment never blocks the UI.** Fire and forget, poll status via Supabase Realtime, update the card in place.
4. **Dish and Cook are separate tables.** A Cook is one attempt; a Dish is the idea. Never collapse them.
5. **Store raw model output in `extraction jsonb` always.** Normalised tables are derived from it, never replace it.
6. **RLS on every table, owner-scoped, from the first migration.** This is the only thing between someone's private log and a leak. Two predicates: `is_participant(cook)` (you're in `cook_participant`) and `can_view(owner_id)` (you're the owner or hold an accepted `view_share`). A cook is readable when `is_participant OR can_view(owner_id)`, writable only when `is_participant`. Dishes/ingredients/techniques readable via `can_view(owner_id)`, writable only by the owner. Never disable RLS "temporarily"; never reach the DB with the service-role key from anywhere the client can touch.
7. **Every cook and dish carries `owner_id`; co-cooks add rows to `cook_participant`.** `owner_id` / `author_id` and the owner's participant row are set server-side from `auth.uid()` — never trust the client to assert who it is. Default state (no shares, no co-cooks) means a log is visible to exactly one person; sharing only ever *adds* visibility.
8. **Optimistic UI on every write.** Never a spinner between a tap and a visible result.
9. **EXIF timestamps, not upload timestamps.**

---

## Design tokens

Do not introduce colours outside this system.

```css
--ink:       #14150F;  /* near-black, faint green undertone */
--paper:     #EDEEEA;  /* cool paper white — NOT cream */
--graphite:  #6B6D64;  /* secondary text */
--hairline:  #D6D7D1;  /* rules, dividers */
```

**Accent colour comes only from data.** Each cuisine has a fixed hue; unknown cuisines generate deterministically (`hash(cuisine) % 360`, fixed S/L). No accent colour is hardcoded into chrome.

```
Display  Bricolage Grotesque  — dish names only
Body/UI  Inter Tight
Data     IBM Plex Mono        — dates, counts, ratings, attempt numbers
```

### Design rules

- The photos are the design. Chrome is recessive and quiet.
- Anything that is data gets monospace. Anything that is prose does not.
- One motion moment only: the feed card filling in as enrichment lands. Everything else is still.
- Respect `prefers-reduced-motion`.
- Bottom third of the screen is the thumb zone — all primary actions live there.
- Large tap targets. Assume greasy hands and a phone propped against a chopping board.
- Attribution appears only on co-cooked entries ("with Pierce") and when viewing someone else's shared log — most of the time the feed is entirely yours and needs no author mark. When shown, it's *data*: monospace, a monogram or initial, quiet. Never a chunky social avatar. Never competing with the food.

---

## Do not

- Do not build a custom camera UI. Use `<input type="file" capture="environment">`.
- Do not build a custom audio recording pipeline. iOS keyboard dictation into a textarea is the transcription layer.
- Do not add required fields to capture. Ever.
- Do not add modal dialogs to the capture path.
- Do not use warm cream backgrounds, terracotta accents, or acid-green-on-black. These are AI-design house style and this app should not look like that.
- Do not add a settings screen until something genuinely needs configuring.
- Do not normalise ingredients into join tables before phase 3. `jsonb` queries are fine until then.
- Do not optimise for desktop or Android. iOS PWA only.

---

## Working style

- Build in thin vertical slices that are deployable and usable, not in horizontal layers.
- Deploy to Vercel and test on the actual phone at the end of every slice. Simulators lie about camera, keyboard, and dictation behaviour.
- When a decision is ambiguous, ask rather than assuming — especially anything touching the capture flow or the data model.
- Prefer boring, obvious code. This is a personal project that needs to survive being ignored for three months at a time.

---

## Current phase

**Phase 0 — prove the loop, on a per-owner foundation.**

One screen: take a photo, save a row, see it on a feed. No AI, no enrichment, no sharing. Installed to the home screen and used for real dinners before anything else gets built.

But get ownership right now, because retrofitting it is a rebuild: `profile` table, magic-link auth, `owner_id` on every cook and dish, and owner-scoped RLS from the very first migration. Just Sahil, just his own log. Do **not** build view-shares, co-cooking, or the invite flow yet — that's phase 2b. Just make sure every row is owned and RLS-protected so nothing has to be migrated later.

Done when five actual dinners have been logged without thinking about it, and every row is already owned and protected.
