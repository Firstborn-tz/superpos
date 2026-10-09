# SuperPOS — Multi-Branch Supermarket POS System

A production-ready, offline-first point-of-sale system for supermarkets with
multiple branches. Works on desktop, laptop, tablet, and phone — cashiers can
keep selling even with no internet connection, and everything syncs
automatically once they're back online.

## Architecture

- **Frontend**: React 19 + TypeScript + Vite, styled with Tailwind CSS.
- **Data**: Cloud Firestore, used directly from the client (no separate
  backend server to deploy or keep running). Firestore's persistent local
  cache keeps the app fully functional offline, and a custom sync queue
  (`src/services/sync/syncService.ts`) tracks every offline write
  (`ADD_PRODUCT`, `ADD_STOCK`, `SALE`, branch changes) and replays it the
  moment connectivity returns.
- **State**: Zustand, with `authStore` persisted to `localStorage` so a
  cashier's session survives a page refresh or app restart.
- **PWA**: installable on any device (Add to Home Screen), with a service
  worker for asset caching.

This is the same architecture used by production offline-first retail apps —
adding a separate Node/NestJS API in front of Firestore would introduce a
server to host, patch, and keep online, without adding capability, since
Firestore already provides secure, rules-based access control and real
offline persistence. If your business later needs custom server-side logic
(e.g. SMS receipts, accounting-system integration), add Cloud Functions
rather than a full backend — see "Extending" below.

## Project structure

```
superpos/
  firebase.json            Firebase Hosting + Firestore deploy config
  firestore.rules          Firestore security rules
  firestore.indexes.json   Firestore composite indexes
  frontend/
    src/
      pages/                One file per screen (Login, Dashboard, POS, ...)
      components/
        common/              Icons, Modal, StatCard, OfflineIndicator, ErrorBoundary
        layout/               Sidebar, TopBar, DashboardLayout
        auth/                 ProtectedRoute
      store/                  Zustand stores (auth, cart, data)
      services/
        firebase/             Firestore reads/writes
        sync/                 Offline pending-operation queue
        barcode/               bwip-js barcode/QR rendering
        auth/                  Admin + branch login logic
      utils/                  Formatting, id/barcode generation, storage, print
      config/firebase.ts       Firebase app initialization
      types/index.ts           Shared TypeScript types
```

## Getting started

### Prerequisites

- Node.js 20+
- A Firebase project with **Firestore** and **Authentication (Email/Password)**
  enabled. Defaults for the project this was built for are already filled in;
  override them by copying `.env.example` to `.env` if you're pointing at a
  different Firebase project.

### Install and run

```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:5173` and is reachable from other devices
on your network at `http://<your-computer-ip>:5173` (useful for testing on a
phone/tablet on the same Wi-Fi).

### Create the first admin account

Admins sign in with Firebase Authentication. Create the owner's account once,
from Firebase Console > Authentication > Users > Add user (email + password).
Then create `admins/{uid}` in Firestore using that account's Firebase Auth UID
as the document ID and `{ "role": "admin" }` as its data.

Cashiers keep signing in with the branch name and branch password. Each branch
also needs a Firebase Auth Email/Password user whose email is
`<branchId>@cashiers.superpos.invalid` and whose password is the branch
password. Create `cashier_access/{authUid}` in Firestore with
`{ "role": "cashier", "branchId": "<branchId>" }`. Use the ID of the matching
branch document for `branchId`. The app resolves the public branch name to that
ID before signing the cashier in. The `.invalid` address is an internal login
identifier and does not receive email.

Provision these Auth users and mapping documents in Firebase Console when
adding branches. Firebase client apps cannot securely create or reset other
users' passwords without a trusted server. Existing branch passwords are
stored as hashes, so enter the current password when provisioning; otherwise
reset it in Firebase Authentication Console and give the cashier the new
password. Cashiers can change their own password from Settings after signing
in.

### Build for production

```bash
npm run build
```

Output goes to `frontend/dist/`. This is a fully static site — deploy it to
any static host (Firebase Hosting, Netlify, Vercel, S3 + CloudFront, or an
Nginx server on your own machine).

### Deploy to Firebase Hosting (recommended, matches the Firestore project)

```bash
npm install -g firebase-tools   # once
firebase login
cd ..                            # repo root, where firebase.json lives
npm run build --prefix frontend
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

This deploys the built frontend, Firestore rules, and indexes. The root `firebase.json` does not deploy Cloud Functions, so this setup does not require the Blaze plan. Before deploying rules to an existing project, create the `admins/{uid}` membership document for each administrator or access will be denied by the role checks. Confirm Email/Password sign-in is enabled and your production domain is listed under Authentication > Settings > Authorized domains.

### Preview a production build locally

```bash
cd frontend
npm run build
npm run preview
```

## Running on multiple devices at once

Because branches, inventory, and sales all live in Firestore, you can run
SuperPOS on as many computers, tablets, and phones as you like — a laptop at
the admin's office, a tablet at each branch's till, whatever the shop has.
Each device:

1. Signs in once (admin or a specific branch).
2. Keeps working normally with no internet — sales, stock changes, and new
   products are saved to that device immediately.
3. Syncs automatically in the background whenever it regains connectivity,
   and every 60 seconds while online. The banner at the top of the screen
   shows offline / syncing / synced status and how many changes are still
   pending.

There is no realtime conflict resolution beyond "last write wins" per
record — appropriate for a single-till-per-branch shop. If two cashiers can
sell from the same till/device simultaneously, consider adding Firestore
transactions around stock decrements (see "Extending").

## Production checklist

- [ ] Create the real admin account(s) in Firebase Authentication and remove
      any test accounts.
- [ ] Review `firestore.rules` against your business's access needs. Sales,
      refunds, expenses, and stock adjustments are role and branch scoped;
      inventory, public branch names, and chat currently have public reads.
- [ ] Set Firebase Authentication's authorized domains to your production
      domain (Firebase Console → Authentication → Settings).
- [ ] Generate real app icons if you want your own branding — replace
      `frontend/public/icon-192.png`, `icon-512.png`, and `favicon.svg`.
- [ ] Set up Firestore backups (Firebase Console → Firestore → Backups) —
      this is your system of record once devices sync.
- [ ] Test the offline flow on the actual devices/browsers you'll use at the
      till: turn off Wi-Fi, make a sale, add stock, turn Wi-Fi back on, and
      confirm the sync banner clears and the data appears in the Firebase
      Console.
- [ ] Decide a low-stock threshold and expiry-warning window that fit your
      store (currently 5% of initial stock and 7 days, in `src/utils/helpers.ts`).

## Extending

- **Server-side logic** (SMS receipts, accounting exports, scheduled
  reports): add a Firebase Cloud Function that listens to Firestore writes,
  rather than standing up a separate API server.
- **Cashier accounts**: branch name and password remain the cashier-facing credentials; Firebase Auth accounts and `cashier_access` documents provide authenticated, branch-scoped Firestore access without a server function.
- **Multi-till concurrency**: wrap stock decrements in a Firestore
  `runTransaction` in `src/services/firebase/firestoreService.ts` if a
  branch will ever run two tills against the same inventory simultaneously.
