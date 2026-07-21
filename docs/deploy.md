# Deploying the site

The public site (`site/`) auto-deploys to Firebase Hosting
(<https://lea-tongan-speech.web.app>) on every merge to `main` that touches
`site/`, `firebase.json`, or `.firebaserc`, via
[`.github/workflows/deploy-hosting.yml`](../.github/workflows/deploy-hosting.yml).
You can also trigger it manually from the repo's **Actions → Deploy Hosting → Run
workflow**.

Only **Hosting** is deployed by this pipeline. Cloud Functions and Firestore/Storage
rules are deployed separately (they change rarely and have their own blast radius).

## One-time setup: the `FIREBASE_SERVICE_ACCOUNT` secret

The workflow authenticates with a Google service-account key stored as the GitHub
Actions secret `FIREBASE_SERVICE_ACCOUNT` (a token from `firebase login:ci` is
deprecated — use a service account).

**Easiest — let the Firebase CLI create it for you:**

```bash
firebase login
firebase init hosting:github   # in a throwaway checkout; pick this repo
```

When prompted "Set up the workflow to run a build script before every deploy?"
answer **No** (the site is static). This flow provisions a service account with the
**Firebase Hosting Admin** role and stores its key as a repo secret. If it names the
secret `FIREBASE_SERVICE_ACCOUNT_LEA_TONGAN_SPEECH` (project-suffixed), either rename
it to `FIREBASE_SERVICE_ACCOUNT` in **Settings → Secrets and variables → Actions**, or
update `firebaseServiceAccount:` in the workflow to match. Delete any extra workflow
files the CLI generates — this repo already has `deploy-hosting.yml`.

**Manual alternative:**

1. Google Cloud Console → the `lea-tongan-speech` project → **IAM & Admin → Service
   Accounts → Create service account**.
2. Grant it **Firebase Hosting Admin** (`roles/firebasehosting.admin`).
3. **Keys → Add key → JSON**, download the key.
4. GitHub → repo **Settings → Secrets and variables → Actions → New repository
   secret**, name `FIREBASE_SERVICE_ACCOUNT`, paste the full JSON as the value.

The JSON key is a real credential — it lives only in GitHub Secrets and must never be
committed (the repo's gitleaks scan will flag it if it is).

## Custom domain: `speech.leafakatonga.com`

The site is reachable at its default Firebase URL (<https://lea-tongan-speech.web.app>)
and at the custom domain **`speech.leafakatonga.com`**.

`leafakatonga.com` is a **separate** property: its apex is served by a *different*
Firebase project (our other app) and its DNS is managed at **GoDaddy** (nameservers
`ns05/06.domaincontrol.com`). We attach only the `speech` subdomain to *this*
(`lea-tongan-speech`) project. A subdomain record is independent of the apex, so this
does not touch or conflict with the other app on the root domain, and Firebase verifies
ownership per-project.

Nothing in the app is hard-coded to a hostname — API calls are same-origin via the
`firebase.json` rewrite, and the Cloud Function uses `cors: true` — so no code change is
needed to serve from the new domain. The one manual add is the Auth authorized domain
(step 4).

**One-time setup (Firebase Console + GoDaddy — cannot be scripted):**

1. **Firebase Console → `lea-tongan-speech` project → Hosting → Add custom domain.**
   Enter `speech.leafakatonga.com`. Firebase returns a **TXT** record (ownership
   verification) and then either **one/two A records** or a **CNAME target** for the
   `speech` host.
2. **GoDaddy → the `leafakatonga.com` domain → DNS → Manage Zone.** Add the records
   Firebase gave you, using **`speech`** as the record **Name/host** (not the full
   domain — GoDaddy appends the zone). Add the TXT first to verify, then the A/CNAME.
   Leave the existing apex records untouched.
3. Wait for verification and automatic SSL provisioning (minutes to ~24h).
4. **Firebase Console → Authentication → Settings → Authorized domains → Add domain**
   → `speech.leafakatonga.com`. The review page (`site/review.js`) signs in with
   Firebase Auth; this keeps sign-in working from the custom domain.

To verify from the command line once DNS has propagated:

```bash
dig +short A speech.leafakatonga.com      # should return the Firebase IP(s)
curl -sI https://speech.leafakatonga.com  # should return HTTP/2 200 with a valid cert
```

## Manual deploy (no pipeline)

From a checkout on the commit you want live:

```bash
npm i -g firebase-tools
firebase deploy --only hosting --project lea-tongan-speech
```
