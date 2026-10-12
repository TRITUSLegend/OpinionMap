# Change Plan — Auth Hardening & UI Polish

Branch `feat/auth-hardening-ui-polish`, based on `5b2248b`.

## Corrections to the brief

The code disagrees with the brief and existing docs in these places. The code wins.

- Settings live in `backend/app/config.py`, not `core/config.py`.
- `ACCESS_TOKEN_EXPIRE_MINUTES` is **480** (`config.py:38`); `ARCHITECTURE.md` still says 30.
- `POST /api/auth/register` returns a bare `UserResponse`, not a token (`auth.py:16-35`), although
  `ARCHITECTURE.md:232` and `Signup.tsx:28` both assume a token.
- `GET /api/auth/users` is **not** self-scoped for non-admins (`ARCHITECTURE.md:235` is wrong), see 2.3.
- There is no `GET /api/auth/me` (404 on the deployment).
- `auth.py` imports the unvalidated `schemas/user.py`. The validated `schemas/auth.py` and
  `services/auth_service.py` (which hardcodes `role="admin"`) are dead code.

## Evidence

**Live deployment** (`opinionmap.onrender.com`, probed 2026-10-12; read-only requests plus one
failed login with a fake address):

| Probe | Result |
|---|---|
| First `GET /` after idle | no bytes within **90 s** (cold start) |
| Warm `GET /` (no DB) | 0.31 s total, ~0.24 s of it network |
| Warm `GET /api/monitoring/health` (`SELECT 1`) | ~1.5 s |
| `POST /api/auth/login`, unknown email | `401 Incorrect email or password`, 1.50 s — bcrypt never runs on this path |
| JWT signed with the default `JWT_SECRET_KEY` | rejected at signature check — production does **not** use the default secret |
| CORS preflight from `opinionmap.netlify.app` | allowed, origin correctly scoped |
| Deployed bundle | same auth logic as the repo; 668 KB; calls `https://opinionmap.onrender.com/api` |

**Local reproduction**: Python 3.11, same `requirements.txt` (bcrypt 5.0.0, FastAPI 0.143), on a scratch
SQLite DB, against the unmodified code.

---

## 2.1 "Anyone can log in with an email that doesn't exist"

**The server never issues a token for an unknown email.** `login` / `admin_login`
(`auth.py:63-126`) short-circuit to 401 when the lookup returns `None`. Verified locally and live.
There is no auto-create, demo branch or env flag; `DEMO_USER_ID` (`security.py:17-18`) is an unused
constant. The frontend has no demo/guest/mock path either.

What the client gets wrong:

1. **No session is ever validated.** `ProtectedRoute` (`App.tsx:13-19`) checks `!!token`, and
   `readStoredSession` (`AuthContext.tsx:13-28`) accepts any string token plus any JSON user. An
   expired token, a token for a deleted account, or a hand-written `token=x` with a fake `user` all
   render the full app shell with the stored name, email and role. Only pages that call the API are
   bounced by the 401 interceptor; `/settings` never is.
2. **Failed logins keep the previous session.** `Login.tsx` never clears an existing session. Any
   failure other than 401 leaves the old token in place: the 30 s axios timeout during a cold start
   (measured at more than 90 s), a network error. Navigating to any route then lands in the old
   session, which from the user's seat looks like "I typed an email that doesn't exist and got in".
3. **The real 401 message is never shown.** The global 401 interceptor (`client.ts:23-33`) also fires
   for `/auth/login` and hard-reloads `/login`, so the form just resets.
4. **Signup stores junk.** `Signup.tsx:28` calls `login(data.access_token, data.user)` on a response
   containing neither, writes the string `"undefined"` to both keys, and bounces to `/login`.

Server-side contributors:

- **Users-list bug creates emails that don't exist.** When a non-admin lists users, other accounts'
  emails are rewritten in the DB to values like `j***@corp.test`. From then on, that account only
  accepts the masked address, and its owner's real email returns 401. Reproduced; see 2.3.
- **Account-state oracles.**
  - An inactive account with the correct password returns `400 Inactive user`
    (`auth.py:79-83, 114-118`), which confirms the password.
  - An unknown email answers in **3 ms** versus **185 ms** for a known one (bcrypt only runs when the
    user exists). That allows email enumeration by timing.

**Root cause (best supported):** the client trusts localStorage with no server check, and a failed
login does not end the previous session. The email-rewrite bug manufactures accounts whose login
address does not exist. The server itself rejects unknown emails.

Suspicious rows to review (read-only; nothing is deleted by this change):

```sql
-- emails rewritten by the users-list bug; the owners cannot log in with their real address
SELECT id, email, full_name, role, created_at, updated_at FROM users WHERE email LIKE '%***%';
-- more than one admin would point at the first-registrant-becomes-admin rule (auth.py:22-24)
SELECT id, email, created_at FROM users WHERE role = 'admin' ORDER BY created_at;
-- malformed emails accepted by the unvalidated register schema
SELECT id, email, created_at FROM users WHERE email NOT LIKE '%_@_%._%';
```

No auto-creation path exists, so there are no "auto-created" rows to look for.

## 2.2 Slow login

| Factor | Finding |
|---|---|
| bcrypt cost | `bcrypt.gensalt()` → cost **12** (`security.py:21`); stored hashes are `$2b$12$`, 60 chars, in `VARCHAR(255)` |
| Event loop | `hash_password` / `verify_password` run synchronously inside `async def` handlers (`auth.py:28, 72, 101`) |
| Redundant hashing | none: `get_current_user` does JWT decode + one `SELECT`, no bcrypt |
| Login path work | one `SELECT`; `get_db` commits an empty transaction; relationships are `lazy="select"`; no `last_login` write |
| DB pool | `pool_size=20, max_overflow=10, pool_pre_ping=True` (`database.py:19-25`); pre-ping adds one round trip per checkout |
| Signup | same blocking hash |
| bcrypt 5.0.0 | raises `ValueError` on passwords over 72 bytes, so **login and register return 500** (reproduced) |

Local measurements against the unmodified code, uvicorn + SQLite:

| Test | Result |
|---|---|
| bcrypt `checkpw`, cost 10 / 11 / 12 / 13 | 45 / 91 / 182 / 363 ms |
| Valid login, 20 sequential | p50 185 ms, p95 187 ms |
| Unknown-email login | p50 **3 ms** (timing oracle) |
| 8 concurrent logins | fully serialised: slowest **1478 ms** (8 × 185) |
| `GET /` issued during those logins | 124 ms instead of ~3 ms (event loop blocked) |

Estimated time budget for a warm login on the deployment:

- **Network:** ~0.24 s.
- **Database:** ~**1.2 s**, the gap between `/` and `/health` or an unknown-email login. Every
  DB-touching request does pre-ping, BEGIN, query and COMMIT. At ~1.2 s, the database is almost
  certainly in a different region from the web service. Code cannot fix that.
- **bcrypt-12 verify:** 182 ms on a desktop core. Render's free tier is 0.1 CPU, so it's roughly
  **1.8 s** (an estimate; I can't measure on Render without creating an account in production).

**Cold start** is the real timeout. Importing `app.main` takes **18 s** on a desktop core: 11.8 s via
`app.api.workflows` (agent pipeline) and 3.3 s via `app.api.rag` (chromadb). At 0.1 CPU that is
minutes, which matches the >90 s observed and always exceeds the 30 s axios timeout.

## 2.3 Users visible to everyone

`GET /api/auth/users` (`auth.py:37-62`) accepts any authenticated user.

- **Exposure:** non-admins receive every non-admin account (id, name, role, status, created_at).
- **Corruption:** other users' emails are "masked" by assigning to ORM attributes (`auth.py:53-60`),
  and `get_db` then commits (`database.py:47`). The masked values are **persisted**:
  - Reproduced: after a viewer opened the list, the DB held `j***@corp.test` and John's real email
    returned 401.
  - When two masks collide (`john@` and `jane@` both become `j***@`), the commit raises
    `IntegrityError` and the request returns 500.

Other findings:

- `GET /api/admin/users` (`admin.py:6-8`) is already admin-only but is a stub returning `[]`. The
  frontend doesn't use it.
- `Users.tsx`, the `/users` route (`App.tsx:32`) and the nav link (`Sidebar.tsx:16`) have no role gate.
- **Serialised fields:** `UserResponse` (`schemas/user.py:17-24`) exposes id, email, full_name, role,
  is_active and created_at. `hashed_password` is never serialised. `full_name` is declared `str` but the
  column is nullable, so a NULL name would cause a 500.
- **Mass assignment is not possible:** `UserCreate` has no `role` field and extra keys are ignored.
  `{"role": "admin"}` registers a viewer (reproduced). However, the first registrant on an empty DB
  becomes admin (`auth.py:22-24`).
- **No input validation on register:** it accepted `not-an-email`, a 1-character password and an
  empty name (reproduced).
- **Ownership audit:**
  - Scoped by `current_user.id`: workflows, reports (including PDF/DOCX export), dashboard and
    schedules.
  - **Exception:** `POST /api/rag/query` (`rag.py:14-21`) accepts any `workflow_id` with no ownership
    check. That allows a cross-tenant read if a workflow UUID leaks. Report only: RAG is out of scope.

## 2.4 UI inventory

- **Scroll container is the window.** Layout (`Layout.tsx:10-14`) is `min-h-screen flex`, and
  `<main class="flex-1 overflow-y-auto">` has no bounded height, so it never overflows.
- **Existing stacking:** the header is already `sticky top-0 z-10` (`Header.tsx:108`); the sidebar is
  `fixed z-50`; the mobile backdrop is `z-40`; the modal and dropdowns are `z-50`.
- **Tailwind:** v4 via `@tailwindcss/vite`. Tokens live in `@theme` (`index.css:3-12`): dark only,
  accent `#76b900`, `color-scheme: dark`.
- **Classes that don't exist:**
  - `text-electric-blue` (`Dashboard.tsx:152`)
  - `from-electric-blue` / `to-violet` / `bg-violet` (`Users.tsx:67, 80`)
  - `custom-scrollbar` (Header, Sidebar)
- **Hardcoded colours:**
  - `bg-black`, `text-white`, `gray-*` and `white/5` throughout
  - `bg-[#0a0a0a]`, `#0f0f0f`, `#0d1424`
  - Recharts hex values at `Dashboard.tsx:38-42, 276-298, 293, 328-341`
- **Fonts:** `'Inter'` is named but never loaded, so the system fallback is what renders.
- **Loading UI:** text rows ("Loading workflows..."), ping dots (Dashboard), a border spinner (Header)
  and `Loader2` on the auth buttons.
- **Off-brief styling:**
  - emoji used as icons: 🚀 (`Dashboard.tsx:220`) and 🔍 (`Dashboard.tsx:183`)
  - gradient text (`Users.tsx:37`, `Settings.tsx:4`)
  - heavy card shadows (`glass-card`, `hover:shadow-2xl`)
  - a generic robot logo
- **Forms:**
  - Login: email, password, User/Admin toggle
  - Signup: name, email, password; no confirm field
  - New-workflow modal: query plus 7 source checkboxes; errors shown with `alert()`
  - Settings has no form; the header search box is a non-functional input
- **Storage:** localStorage `token` and `user`; no cookies. This change adds `theme` and
  `storage-notice-dismissed`.

---

## Plan

**Phase 2 (backend).**

- **Login:**
  - Unknown email, wrong password and inactive account all return one generic 401.
  - bcrypt runs in the threadpool.
  - A dummy-hash check makes unknown emails take as long as known ones.
  - Hashes are transparently re-hashed when the cost changes.
  - Passwords over 72 bytes are rejected, not a 500.
- **Users list:** `GET /api/auth/users` is admin-only and no longer mutates rows. Add `GET /api/auth/me`.
- **Register:** validated (email format; password 8 chars to 72 bytes; non-empty name).
- **Ops:** `HEAD /` for uptime monitors; a startup warning if the default JWT secret is in use.
- **Tests:** a pytest suite.

**Phase 3 (frontend).**

- **Session handling:**
  - Validate the stored session's shape and `exp` before first render, then confirm with `/me` in
    the background.
  - Clear the session before each login attempt.
  - Let auth forms handle their own 401s.
  - Signup: register, then log in.
- **Design and theming:** design tokens, light/dark mode, motion, and role-aware nav.
- **New features:** the requested components, plus a 90 s auth timeout, a server warm-up ping and a
  "waking the server" message.

## Decisions that could reasonably go either way

1. **bcrypt default stays at 12** (`BCRYPT_ROUNDS`, allowed range 10–15).
   - For: 185 ms locally; lowering it reduces security for every account; the measured bottlenecks
     are cold start and DB latency, which cost does not touch.
   - Against: on Render free, cost 12 is an estimated ~1.8 s of CPU per login.
   - If the free tier stays, `BCRYPT_ROUNDS=11` halves that. Existing hashes migrate on next login.
2. **Duplicate email keeps `400 Email already registered`**, not 409. The frontend maps both. The
   status is not changed because no fix requires it.
3. **Admin-login with a valid non-admin account keeps 403.** It reveals nothing `/login` doesn't
   already. Unknown, wrong-password and inactive all return the generic 401.
4. **Signup registers and then logs in** with the same credentials. The alternative was changing
   `/register`'s response to a token, which is an API shape change.
5. **No email lowercasing.** Existing rows may be mixed-case, and lowercasing at login would lock
   those users out. Case-insensitive email needs a data migration first.
6. **Password policy:** 8 characters minimum, 72 bytes maximum (the bcrypt limit), no composition
   rules. Applies to new registrations only; existing passwords keep working.
7. **First registrant becomes admin is kept.** It is the only bootstrap path; the risk is documented.
8. **Pipeline imports are not lazy-loaded** to shorten cold start: that rewires workflow creation,
   which is out of scope. Mitigated with an uptime ping, the warm-up ping, the longer timeout and the
   waking-up message.
9. **RAG ownership check is not added** (report only, per the brief).
10. **Session check is optimistic.** The UI renders from the validated stored session while `/me`
    confirms it. This avoids a loading flash and keeps cold starts usable. Expired or malformed
    tokens are dropped before the first render; a 401 from `/me` signs the user out.
11. **Auth requests time out at 90 s**, not 60 s, because the measured cold start exceeded 90 s.
12. **Masked emails already in production cannot be recovered in code.** The original values are
    gone; see the manual steps in the final report.

## Design direction

An editorial, data-instrument look built for reading opinion data:

- **Surfaces:** warm paper/charcoal neutrals with hairline borders in place of shadows; small 6–8 px radii.
- **Type:** a system serif for page titles over a system sans, tabular numerals and small caps-style
  captions. Zero font bytes.
- **Data colours:** sentiment is a polarity, so it uses a diverging pair with a grey midpoint:
  positive blue, neutral grey, negative red. It is reserved for charts and sentiment badges.
  - Green/red and aqua/red were rejected after running a colour-vision-deficiency validator; they
    fail or only warn. Blue/grey/red passes all pairs in both themes (worst CVD ΔE 8.7 light /
    10.6 dark, every mark ≥ 3:1 on its surface).
  - Values: light `#2a78d6 / #898781 / #e34948`, dark `#3987e5 / #b5b3ab / #e66767`.
- **Accent:** one ink accent (near-black in light, off-white in dark) for primary buttons, links,
  focus rings and the active nav item.
  - It replaces the old green.
  - Because blue now *means* positive sentiment, a coloured accent would be mistaken for data.
  - Links are underlined, so they don't rely on colour.
- **UI states:** success, warning and danger are separate tokens, always paired with an icon or label.
- **Contrast:** all text tokens are AA (≥ 4.5:1) on their surfaces in both themes, and form-control
  borders are ≥ 3:1.
- **Theming:** both themes are two sets of the same CSS variables, and charts read them at runtime.
