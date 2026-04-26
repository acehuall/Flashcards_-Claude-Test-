# Flashcard App — Phase B

A production-ready flashcard web app built with React, Vite, TypeScript, Dexie.js, and Tailwind CSS.
All data is stored locally in IndexedDB — there is no backend.

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → dist/
npm run type-check   # TypeScript only, no emit
```

---

## Folder structure

```
src/
├── app/
│   ├── App.tsx          # Root: wraps all providers
│   └── Router.tsx       # BrowserRouter + all <Route> definitions
│
├── domain/
│   ├── types.ts         # All shared TypeScript types and interfaces
│   ├── reviewEngine.ts  # Pure reducer + helper functions (no React deps)
│   ├── csvService.ts    # CSV parse (PapaParse) + export (Blob download)
│   └── deleteService.ts # Cascade delete logic coordinated across tables
│
├── db/
│   ├── index.ts         # Dexie database class + table definitions
│   └── repositories/
│       ├── packRepo.ts
│       ├── setRepo.ts
│       ├── cardRepo.ts
│       └── sessionRepo.ts  # Sessions, results, stats, activeSessions
│
├── context/
│   ├── ToastContext.tsx    # Global toast notifications (reducer-based)
│   └── SettingsContext.tsx # App settings persisted to localStorage
│
├── shared/
│   ├── components/
│   │   ├── Button.tsx        # Variants: primary, secondary, ghost, danger, correct, incorrect, flag
│   │   ├── Modal.tsx         # Modal + ConfirmModal
│   │   ├── FormField.tsx     # Field wrapper, Input, Textarea, Select
│   │   ├── Toast.tsx         # ToastContainer (renders from ToastContext)
│   │   ├── StateViews.tsx    # LoadingSpinner, EmptyState, NotFound, PageHeader, Badge
│   │   └── PackColors.ts     # Colour palette + helper
│   └── layouts/
│       ├── StandardShell.tsx # App shell: top nav + page container + toast host
│       └── ReviewShell.tsx   # Review shell: progress bar + minimal chrome
│
└── features/
    ├── home/
    │   └── HomePage.tsx         # Pack grid, delete pack
    ├── packs/
    │   ├── CreatePackPage.tsx   # Name + colour picker
    │   └── PackDetailPage.tsx   # Set list, delete set
    ├── sets/
    │   ├── CreateSetPage.tsx
    │   └── SetDetailPage.tsx    # Card list, CSV import/export, review launch
    ├── cards/
    │   └── CardFormPages.tsx    # CreateCardPage + EditCardPage
    ├── review/
    │   └── ReviewPage.tsx       # Full review engine: flip, mark, requeue, persist
    ├── results/
    │   └── ResultsPage.tsx      # Donut chart, card breakdown, retake actions
    ├── settings/
    │   └── SettingsPage.tsx
    └── notfound/
        └── NotFoundPage.tsx
```

---

## Architecture principles

### Data flow
```
UI → dispatch(action) → reviewReducer (pure) → new state
                                              → saveSnapshot (side effect)
                                              → completeSession (side effect) → DB
```

The review engine (`domain/reviewEngine.ts`) is a pure reducer with pure helper
functions. No React hooks, no DB calls, no side effects — only state transforms.
All persistence is handled in `useEffect` blocks in `ReviewPage.tsx` that react to
state changes. This makes the engine trivially testable.

### Repository pattern
Dexie is never called directly from UI components. All DB access goes through
`db/repositories/`. Services in `domain/deleteService.ts` coordinate multi-table
operations within Dexie transactions.

### Provider hierarchy
```
SettingsProvider
  └── ToastProvider
        └── AppRouter
              └── (routes)
```

### Review session lifecycle
1. **Boot**: Check for active snapshot → if found, offer resume → else start fresh
2. **Resume validation**: Confirm queued card IDs still exist in DB before restoring
3. **Snapshot**: Written to `activeSessions` table on a 500ms debounce after each action
4. **Completion**: On `isComplete`, persist `results`, update `stats`, mark `session` complete, delete snapshot, navigate to results
5. **Retake modes**: Results screen passes `{ mode, cardIds }` via React Router location state → `ReviewPageWrapper` reads it and passes to `ReviewPage` as props

---

## Routes

| Route                  | Component         | Shell          |
|------------------------|-------------------|----------------|
| `/`                    | HomePage          | StandardShell  |
| `/pack/:packId`        | PackDetailPage    | StandardShell  |
| `/set/:setId`          | SetDetailPage     | StandardShell  |
| `/review/:setId`       | ReviewPage        | ReviewShell    |
| `/results/:sessionId`  | ResultsPage       | StandardShell  |
| `/create/pack`         | CreatePackPage    | StandardShell  |
| `/create/set/:packId`  | CreateSetPage     | StandardShell  |
| `/create/card/:setId`  | CreateCardPage    | StandardShell  |
| `/edit/card/:cardId`   | EditCardPage      | StandardShell  |
| `/settings`            | SettingsPage      | StandardShell  |
| `*`                    | NotFoundPage      | StandardShell  |

---

## Review engine — re-queue rule

```
CORRECT  → remove from queue. currentIndex stays; next card shifts into slot.
INCORRECT → requeue at min(currentIndex + 3, queue.end). Score tracked in outcomes map.
FLAGGED  → remove from queue (like correct). Added to flaggedCardIds[]. Score tracked.
```

Outcomes map is the authoritative record. When `queue.length === 0`, session is complete.

---

## CSV format

Import and export both use exactly two columns:

```csv
question,answer
What is the powerhouse of the cell?,The mitochondria
What year did WW2 end?,1945
```

- Headers must be exactly `question` and `answer` (case-sensitive)
- Rows with blank question or answer are skipped silently
- Post-import summary shows imported + skipped counts
- Import cap: 500 rows per file

---

## Keyboard shortcuts (Review screen)

| Key          | Action                                |
|--------------|---------------------------------------|
| `Space`      | Flip card                             |
| `Enter`      | Flip card (also works on card focus)  |
| `←`          | Navigate to previous card             |
| `→`          | Navigate to next card                 |
| `1`          | Mark incorrect (only when flipped)    |
| `2`          | Flag card (only when flipped)         |
| `3`          | Mark correct (only when flipped)      |

---

## Settings (localStorage)

Stored under key `flashcard_settings`. Schema:

```ts
{
  shuffleCards:     boolean  // default: true
  flipAnimation:    boolean  // default: true
  autoShowAnswer:   0|3|5|10 // default: 0 (off)
  swipeGestures:   boolean  // stored, not active until Phase B
  studyReminders:  boolean  // stored, not active until Phase B
}
```

---

## PWA — Progressive Web App (Phase B)

### How it works

The app is a fully installable PWA powered by `vite-plugin-pwa` (Workbox under the hood).

| Layer | Behaviour |
|---|---|
| **Precache** | All JS, CSS, HTML and icon assets are precached on first load via the generated service worker |
| **Navigation fallback** | Any deep route (`/pack/:id`, `/review/:id`, etc.) served offline returns `index.html` — React Router handles the route client-side |
| **Static assets (cache-first)** | Build artifacts served from the precache; never stale because Workbox uses content-hash filenames |
| **Google Fonts** | Font CSS: stale-while-revalidate. Font files: cache-first with 1-year TTL (versioned URLs) |
| **Supabase API / auth** | **NetworkOnly** — auth tokens and sync responses are never cached. Stale auth state could silently break sync |

### Icons

Icons live in `src/public/icons/` (configured as Vite's `publicDir`):

| File | Usage |
|---|---|
| `favicon.png` | Browser tab |
| `Flashcard Icon - 128.png` | Small contexts |
| `Flashcard Icon - 512.png` | Install icon / splash |
| `Flashcard Icon maskable - 512.png` | Android adaptive icon |

> **Note:** A 192 × 192 icon is recommended by the PWA spec but not currently in the assets. Chrome will downscale the 512 icon; installability is unaffected in practice. Add a 192 px variant to `src/public/icons/` and the manifest if you want pixel-perfect small icons.

### Testing installability

1. `npm run build && npm run preview`
2. Open `http://localhost:4173` in Chrome
3. Open DevTools → **Application** → **Manifest** — verify name, icons, and `display: standalone`
4. Open **Application** → **Service Workers** — verify the SW is registered
5. The browser address bar should show an install icon (⊕) after a few seconds
6. Click it or use the "Install app" banner that appears at the bottom of the page

### Testing offline behaviour

1. After first visit, open DevTools → **Network** → set throttle to **Offline**
2. Refresh — the app shell should load from the SW cache
3. Navigate to a deep route (e.g. `/settings`) and refresh — should still load
4. Create / edit a flashcard while offline — Dexie writes to IndexedDB immediately
5. Go back online — if logged in, `SyncContext` fires automatically

### SPA routing on the host

`vercel.json` contains a catch-all rewrite to `index.html`. This ensures deep-link refreshes work when the service worker is not yet active (e.g. first visit, or after a hard refresh that bypasses the SW).

### Install / update / offline UX

| Prompt | When it appears |
|---|---|
| **Install app** banner | `beforeinstallprompt` fires and the app is not already in standalone mode |
| **Update available** banner | A new service worker is waiting; user clicks Reload to apply |
| **Offline** strip | User is offline **and** Supabase sync is configured — indicates changes will sync on reconnect |

All prompts can be dismissed. The offline strip disappears automatically when the connection returns.

### Limitations

- iOS Safari does not fire `beforeinstallprompt`; users must use the Share → "Add to Home Screen" flow manually.
- The offline indicator is suppressed in local-only mode (no Supabase env vars) since being offline has no effect on data persistence.
- A `192×192` icon is absent from the asset set; add one for best cross-platform results.

---

## Intentionally deferred to Phase B

The following are **explicitly not implemented** and should be added without
structural rewrites:

| Feature                     | Status                                               |
|-----------------------------|------------------------------------------------------|
| PWA manifest                | ✅ Done — Phase B                                    |
| Service worker / offline    | ✅ Done — Phase B                                    |
| Install prompt              | ✅ Done — Phase B                                    |
| Mobile-specific UI passes   | ✅ Done — Phase B (safe-area, touch targets)         |
| Swipe gestures              | Phase C — setting is stored, hook is the entry point |
| Study reminder notifications| Phase C — setting is stored                          |
| SM-2 spaced repetition      | Phase C — stats table designed to support it         |
| Tags / categorisation       | Phase C                                              |
| Images in cards             | Phase C                                              |
| Shared / published decks    | Phase C                                              |
| Onboarding flow             | Phase C                                              |
| Usage analytics             | Phase C                                              |

---

## Authentication (Supabase — Phase 1)

Supabase email OTP / magic-link authentication has been added. Local-only mode still works with no configuration — simply leave the env vars unset.

### Environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase project values:

```
VITE_SUPABASE_URL=https://<your-project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

### Supabase dashboard setup

1. Enable **Email** provider under Authentication → Providers.
2. Add your site URL (e.g. `http://localhost:5173` for dev, your Vercel URL for prod) to Authentication → URL Configuration → Redirect URLs.
3. No database tables are needed for auth-only mode.

### Status

| Feature          | Status                         |
|------------------|-------------------------------|
| Magic-link login | Implemented                   |
| Local-only mode  | Works with no env vars        |
| Cloud sync       | Not implemented yet (Phase 2) |

---

## Deployment (Vercel)

```bash
# Set root directory to flashcard-app (or repo root)
# Build command:  npm run build
# Output dir:     dist
# Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for auth-enabled deployments
```

Auto-deploys on push to `main`. PRs get preview deployments automatically.
