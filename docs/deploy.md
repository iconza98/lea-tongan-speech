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

## Manual deploy (no pipeline)

From a checkout on the commit you want live:

```bash
npm i -g firebase-tools
firebase deploy --only hosting --project lea-tongan-speech
```
