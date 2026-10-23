# Plan: sync between PC and iPhone through Google Drive (D1)

Status: planned, not built. It needs one thing from the owner first: a Google OAuth client ID (steps below).

## What the learner gets

- In Settings, a "Sync with Google Drive" card: **Connect**, then **Sync now**, and the time of the last sync.
- The app syncs by itself when it opens and when it goes to the background, so the PC and the iPhone stay in step.
- Everything stays free and private: the data goes into a hidden app folder in the learner's own Google Drive. The app can't see any other files, and no server of ours is involved.

## How it works

- **Sign-in:** Google Identity Services in the browser (OAuth 2 token flow). There's no backend and no client secret. The client ID is public and is fine to keep in the code.
- **Permission:** only `drive.appdata`, a hidden folder that belongs to this app. The learner's own Drive files are never touched.
- **What is stored:** one file, `courseify-sync.json`, in the same shape as today's backup (`exportBackup()`), plus a `deviceId` and an `updatedAt` per record.
- **Merging, not overwriting.** Two devices can both change things between syncs, so a new `core/syncMerge.ts` (pure, unit-tested) merges the local data with the Drive copy:

  | Data | Merge rule |
  | --- | --- |
  | Courses | Per course id, keep the newer `updatedAt`. Deleted courses keep their trash entry, so a delete wins over an older copy. |
  | Progress (answers, reflections, reports) | Per question id, keep the newer answer. Union of completed lessons. |
  | Mastery | Per skill, keep the record with the newer last attempt. |
  | Activity (XP, streak days) | Per day, keep the larger counts. |
  | Settings, glossary/exam dates | The newer change wins. |
  | Chess games and endgame records | Union by id. A finished review wins over an unreviewed copy. |
  | Drill stats | Per drill, the max of solved and best. |

- **Sync step:**
  1. Download the Drive file (if any).
  2. Merge it with the local data.
  3. Save the result locally through `storage.ts`.
  4. Upload the result.

  If the Drive file changed in between (its `version` field moved on), start again from step 1.
- **Offline:** if there is no network, nothing happens; the next open syncs.

## The iPhone catch

A Home Screen app on iOS can't use sign-in pop-ups: they open in Safari and never return. So the app uses the **redirect** flow:

1. Leave the app for Google.
2. Come back to `https://m7neeb.github.io/course-app/#access_token=...`.

The hash router must read and strip that token before it routes; this is a small change in `main.ts`/`router.ts`.

A token lasts one hour. After that, **Sync now** asks Google again, which is one tap with no password while the Google session is alive.

## What the owner needs to do (about 10 minutes, free)

1. Open <https://console.cloud.google.com/>, create a project named "Courseify".
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **OAuth consent screen**:
   - User type: External.
   - App name: Courseify, with the owner's email.
   - Scope: `.../auth/drive.appdata`.
   - Publishing status: **Testing**, with the owner's Gmail added as a test user. That is enough for personal use; no Google review is needed.
4. **Credentials → Create credentials → OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://m7neeb.github.io`, `http://localhost:5173`, `http://localhost:4173`
   - Authorized redirect URIs: `https://m7neeb.github.io/course-app/`, `http://localhost:5173/`, `http://localhost:4173/`
5. Send the **Client ID** (it ends in `.apps.googleusercontent.com`). It is not a secret.

## Build steps (once the client ID is there)

1. Pure core:
   - `core/syncMerge.ts` with unit tests for every row of the table above, including deletes and two devices changing the same course.
   - `updatedAt` stamps added where records lack them (still schemaVersion 2; the new fields are optional).
2. Drive client, `ui/sync/drive.ts`:
   - Sign-in by redirect, keeping the token in memory only.
   - Find, create, download and upload the app-folder file.
   - The upload uses the file's version to catch a write from the other device.
3. Settings card and automatic sync on open and when the app goes to the background. A toast reports failures in plain words ("Couldn't reach Google Drive. Your progress is safe on this device.").
4. Tests:
   - e2e with the Drive client replaced by a fake: two browser contexts act as PC and phone, change different things, sync, and both see everything.
   - A real check on the owner's PC and iPhone.
5. Docs: README, AGENTS.md, and the privacy note in Settings.

## Not in this plan

- Live sync while both devices are open (syncing at start, in the background and on demand is enough).
- Sharing progress with other people.
- Any server.
