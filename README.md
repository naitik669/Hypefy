# Hypefy

**Where your personality lives.** A chat-first, mobile-first social app built for Gen Z — posts, 24-hour Shows, Hype ★ reactions, and messaging.

## Tech Stack

- **Framework:** Next.js 16 (App Router, TypeScript)
- **Styling:** Tailwind CSS v4 — dark-first design system
- **Backend:** Supabase (Auth, Postgres, Realtime, Storage)
- **Hosting:** Vercel (PWA-first, mobile-first)

## Core Vocabulary

| Concept | Hypefy term |
| --- | --- |
| Like | **Hype ★** |
| 24h story | **Show** |
| Verified badge | **Verified Star** |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

Copy `.env.example` to `.env.local` and fill in your Supabase project values
(Settings → API):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

## Project Structure

```
src/
  app/                 # App Router routes + layouts
  lib/supabase/        # Browser + server clients, session helper
  proxy.ts             # Session refresh + route guarding (Next 16 "middleware")
```
