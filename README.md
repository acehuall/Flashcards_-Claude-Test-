# Flashcard App — Phase A

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

## Intentionally deferred to Phase B

The following are **explicitly not implemented** and should be added without
structural rewrites:

| Feature                     | Reason deferred                                      |
|-----------------------------|------------------------------------------------------|
| PWA manifest                | Phase B — after core is stable                       |
| Service worker / offline    | Phase B — vite-plugin-pwa slot is ready              |
| Install prompt              | Phase B                                              |
| Swipe gestures              | Phase B — setting is stored, hook is the entry point |
| Study reminder notifications| Phase B — setting is stored                          |
| SM-2 spaced repetition      | Phase C — stats table designed to support it         |
| Tags / categorisation       | Phase C                                              |
| Images in cards             | Phase C                                              |
| Auth / Supabase sync        | Phase C — data model is portable                     |
| Shared / published decks    | Phase C                                              |
| Onboarding flow             | Phase B polish                                       |
| Usage analytics             | Phase C                                              |
| Mobile-specific UI passes   | Phase B                                              |

---

## Deployment (Vercel)

```bash
# Set root directory to flashcard-app (or repo root)
# Build command:  npm run build
# Output dir:     dist
# No env vars required for Phase A
```

Auto-deploys on push to `main`. PRs get preview deployments automatically.
