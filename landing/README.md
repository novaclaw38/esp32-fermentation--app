# Fermentation Monitor — Landing Page

Static one-page site for the Phase 0 validation track: problem statement,
how-it-works, and an email/pre-order signup form that writes straight into
the `waitlist` table via the Supabase REST API (no backend needed).

## Setup

1. Apply `../supabase/migrations` to your project (creates the `waitlist`
   table with an anon-insert-only RLS policy).
2. Edit `index.html`, fill in the inline `window.SUPABASE_URL` /
   `window.SUPABASE_ANON_KEY` config near the bottom of the file.
3. Deploy `index.html`, `styles.css`, `script.js` as-is to any static host
   (Netlify, Vercel, GitHub Pages, Cloudflare Pages — drag-and-drop the
   folder or point the host at `landing/`).

## Reading signups

The `waitlist` table has no anon/authenticated select policy, so the page
itself can't read signups back — that's intentional (don't leak other
people's emails to every visitor). Read them from the Supabase dashboard's
Table Editor or SQL Editor:

```sql
select email, comment, created_at from waitlist order by created_at desc;
```
