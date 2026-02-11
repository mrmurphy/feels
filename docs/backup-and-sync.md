# Backup sync and tests

## Sync on close

When the user leaves the tab (closes the window, switches tab, or navigates away), the app tries to sync any pending backup so data isn’t lost.

### Why we can’t “await” close

Browsers do not wait for async work during unload. If we `await performSync()` in a `beforeunload` handler, the promise is started but the tab can close before it resolves. The browser never blocks close for our code.

### What we do instead: keepalive

We use **`fetch(..., { keepalive: true })`** for the backup PUT when leaving. That tells the browser the request may outlive the page, so it can finish the request in the background instead of cancelling it.

### Flow

1. **Leave events** (in `useAutoSync`):
   - `visibilitychange` → when `document.visibilityState === 'hidden'` (tab hidden or closing)
   - `pagehide` → when the page is being unloaded (e.g. mobile, some browsers)
   - `beforeunload` → when the window/tab is about to close or navigate away

2. **On any of these**, we call `triggerSyncOnClose()`:
   - Same prechecks as normal sync: online, valid session, `syncEnabled`.
   - Calls `performSync(undefined, { keepalive: true })`.
   - No conflict UI (user is gone).

3. **When a push is needed**, `performSync` passes `{ keepalive: true }` into `putBackup()`, which uses a keepalive fetch for the PUT. The browser may complete that request after the page has unloaded.

### Code touchpoints

- **`src/hooks/useAutoSync.ts`** – `triggerSyncOnClose()`, leave event listeners.
- **`src/backup/api.ts`** – `fetchApiKeepalive()`, `putBackup(data, { keepalive?: boolean })`.
- **`src/backup/backupService.ts`** – `performSync(conflictResolution?, options?: { keepalive?: boolean })`, all `putBackup` calls accept and forward the keepalive option.

---

## Backup test suite

Integration-style tests for backup sync: real Dexie (with fake IndexedDB in Node), mocked network.

### Setup

- **Runner:** Vitest, `jsdom` + `fake-indexeddb` (see `src/test/setup.ts`).
- **Helpers:** `src/test/backupTestHelpers.ts` – `clearDb()`, `seedMinimal()`, `setSettings()`, `seedEntry()`, `getSettingsSnapshot()`.
- **Mocked:** `getBackup` and `putBackup` from `src/backup/api.ts` (no real HTTP).

### What’s tested

| Case | What it checks |
|------|----------------|
| **Creates cloud backup when none exists** | First sync: `putBackup` called with cursor 1, `lastSyncCursor` stored. |
| **Detects no changes when local and cloud match** | Same data: `no-changes`, no push, `lastSyncCursor` aligned to cloud. |
| **Pushes local when base cursor matches cloud cursor** | Safe push: local changed, cloud cursor unchanged → push with cursor+1, cursor persisted. |
| **Returns conflict when cloud advanced beyond local** | Cloud cursor &gt; local base → `conflict`, no push. |
| **keep-local resolution** | Conflict → user keeps local → push with incremented cursor, cursor updated. |
| **use-cloud resolution** | Conflict → user picks cloud → local DB replaced, cursor set to cloud. |
| **merge resolution** | Conflict → merge → merged data pushed, cursor incremented and stored. |
| **Legacy cloud backup without cursor** | Cloud has no cursor, data differs → `conflict` with “outdated” message. |

### How to run

```bash
npm test
```

Watch mode: `npm run test:watch`.
