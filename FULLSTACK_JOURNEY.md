# Areeb's Full-Stack Learning Journal
## Project: CodesSavvy Team Dashboard

> **Goal:** Learn full-stack development by building a real, production app from scratch.
> **Mentor:** Claude (AI)
> **Started:** April 2026
> **Live URL:** https://areeb-dashboard.vercel.app

---

## What We Built

A full-stack team management dashboard for CodesSavvy with:
- Login / Signup (multi-user)
- My Tasks (with urgent priority + browser notifications)
- Team Tasks (assign tasks to team members)
- Upwork Jobs tracker (pipeline: New → Shortlisted → Proposal Sent → Rejected)
- Weekly Goals
- Daily Notes (rich text editor)
- Real-time clock and greeting

---

## Tech Stack

| Technology | What it does |
|---|---|
| **Next.js 16** | The React framework — handles routing, pages, and server logic |
| **React 19** | Builds the UI with components and state |
| **TypeScript** | JavaScript with types — catches bugs before they happen |
| **Tailwind CSS** | Utility-first CSS framework for styling |
| **Supabase** | Backend — database + authentication (free, hosted PostgreSQL) |
| **Vercel** | Deploys the app to a live URL automatically |
| **GitHub** | Stores the code, triggers Vercel deployments |

---

## Concepts Learned

### 1. Next.js App Router
- Pages live in the `app/` folder
- Each folder with a `page.tsx` becomes a URL route
- `app/page.tsx` → `/` (dashboard)
- `app/login/page.tsx` → `/login`
- `"use client"` at the top means the component runs in the browser

### 2. React State & Hooks
- `useState` — stores data that changes (tasks, user input, etc.)
- `useEffect` — runs code when the component loads (e.g. load data from database)
- `useRef` — stores values that don't cause re-renders (e.g. timers)
- State updates trigger re-renders — the UI updates automatically

### 3. TypeScript Interfaces
- Define the shape of your data
```ts
interface Task {
  id: string;
  text: string;
  done: boolean;
  priority: "urgent" | "normal";
  date: string;
}
```
- Catches errors at compile time, not at runtime

### 4. Supabase Authentication
- Email + password signup and login
- `supabase.auth.signUp()` — creates a new user
- `supabase.auth.signInWithPassword()` — logs in
- `supabase.auth.getUser()` — checks if someone is logged in
- `supabase.auth.signOut()` — logs out
- Sessions are stored in **cookies** (important for middleware to work)

### 5. Supabase Database (PostgreSQL)
- Data is stored in tables (like Excel sheets)
- Each table has columns (id, user_id, text, done, etc.)
- CRUD operations:
  - **Create:** `supabase.from("tasks").insert({...})`
  - **Read:** `supabase.from("tasks").select("*")`
  - **Update:** `supabase.from("tasks").update({done: true}).eq("id", id)`
  - **Delete (soft):** `supabase.from("tasks").update({deleted: true}).eq("id", id)`

### 6. Row Level Security (RLS)
- Every user can only see their own data
- Policy: `auth.uid() = user_id`
- Even if someone hacks the frontend, they can't read other users' data
- This is the correct, secure way to build multi-user apps

### 7. Soft Deletes
- Never permanently delete data — just mark it as deleted
- `deleted boolean default false` column on every table
- When loading data: `.eq("deleted", false)` to filter out deleted items
- Why: You can recover data, build history pages, audit logs

### 8. Middleware (proxy.ts)
- Runs on every request BEFORE the page loads
- Checks if user is logged in
- If not logged in → redirects to `/login`
- If logged in and on `/login` → redirects to `/`
- In Next.js 16 this file is called `proxy.ts` (not `middleware.ts`)

### 9. Environment Variables
- Secrets and config stored in `.env.local`
- Never commit `.env.local` to GitHub (it has API keys)
- On Vercel, add them in Project Settings → Environment Variables
- Variables starting with `NEXT_PUBLIC_` are available in the browser

### 10. @supabase/ssr vs @supabase/supabase-js
- `createClient` (supabase-js) → stores session in **localStorage** (browser only)
- `createBrowserClient` (@supabase/ssr) → stores session in **cookies**
- Cookies can be read by the server/middleware — localStorage cannot
- Always use `createBrowserClient` when you have middleware protecting routes

### 11. Vercel Deployment
- Connect GitHub repo → Vercel auto-deploys on every `git push`
- Every push to `main` = new deployment
- Free tier: unlimited deployments, custom domains, HTTPS included
- Environment variables must be added manually in Vercel (not from `.env.local`)

### 12. Git Workflow
```bash
git add <files>          # stage changes
git commit -m "message"  # save a snapshot
git push                 # upload to GitHub → triggers Vercel deploy
```

---

## Database Schema

```sql
-- Each user has a profile with a display name
profiles (id, username, created_at)

-- Personal tasks for today
tasks (id, user_id, text, done, priority, date, done_at, deleted, created_at)

-- Tasks assigned to team members
team_tasks (id, user_id, text, assignee, done, done_at, deleted, created_at)

-- Weekly goals
goals (id, user_id, text, done, week, done_at, deleted, created_at)

-- Upwork job tracking
jobs (id, user_id, link, note, status, deleted, created_at)

-- Daily notes (one per user per day)
notes (id, user_id, content, date, created_at, updated_at)

-- Team members list
members (id, user_id, name, created_at)
```

---

## File Structure

```
areeb-dashboard/
├── app/
│   ├── page.tsx          ← Main dashboard (all pages in one file)
│   └── login/
│       └── page.tsx      ← Login / signup page
├── lib/
│   └── supabase.ts       ← Supabase client (shared across app)
├── proxy.ts              ← Middleware: protects routes
├── .env.local            ← API keys (never commit this)
├── supabase-schema.sql   ← Database setup SQL
└── FULLSTACK_JOURNEY.md  ← This learning journal
```

---

## Problems We Solved

| Problem | Cause | Fix |
|---|---|---|
| "Failed to fetch" on signup | Wrong Supabase API key format | Used legacy JWT key from Supabase → API Keys → Legacy tab |
| DNS error | Typo in Supabase URL (double `k`) | Fixed URL in `.env.local` |
| Login worked but dashboard didn't open | Session in localStorage, middleware reads cookies | Switched to `createBrowserClient` from `@supabase/ssr` |
| Vercel build failed | `package-lock.json` not committed | Committed and pushed `package-lock.json` |
| Mobile cards overlapping/cut off | `h-screen overflow-hidden` locked the entire page to screen height — cards had no room to grow | Added `app-wrapper` CSS class, overrode `height: auto` and `overflow: visible` on mobile in `globals.css` |
| CSS classes not overriding layout | Inline `style={{}}` always wins over CSS classes — media queries in `<style>` tags or CSS files cannot override inline styles | Moved `display: grid` and `gridTemplateColumns` out of inline styles into CSS classes so media queries could override them on mobile |

---

## What's Next (Future Sessions)

- [ ] History page — view completed tasks from previous days
- [ ] Notifications — browser push notifications for urgent tasks
- [ ] Admin view — Hasham can see all team members' tasks
- [ ] Dark/light mode toggle

---

## Key Lessons

1. **Always read errors carefully** — the answer is usually in the error message
2. **Cookies vs localStorage** — cookies work everywhere (server + client), localStorage only in browser
3. **Soft deletes** — never permanently delete data in a real app
4. **RLS** — always protect your database rows so users can't see each other's data
5. **Environment variables** — never hardcode secrets, use `.env.local` locally and Vercel settings in production
6. **Inline styles always win** — `style={{}}` in JSX cannot be overridden by any CSS class or media query. Always use CSS classes when you need responsive behavior
7. **`h-screen overflow-hidden` breaks mobile** — this pattern locks the page to screen height. On desktop it's fine because content is horizontal. On mobile everything becomes vertical and gets squished. Always unlock height on mobile with `height: auto`
8. **Diagnose before fixing** — always find the root cause first. The mobile issue looked like a grid problem but was actually a page height problem one level up
