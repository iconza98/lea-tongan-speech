# Reviewing

How clip moderation is gated, and how to add, remove, or rotate a reviewer.

Contributed clips land in a **pending** state and only enter the CC BY 4.0 dataset once a
reviewer approves them. Reviewers work in the console at
**<https://lea-tongan-speech.web.app/review.html>**, signing in with a Firebase email/password
account.

## How the gate works

Every reviewer action — `listPendingClips`, `getClipAudio`, `acceptClip`, `rejectClip` — runs
server-side through `assertReviewer` (`functions/src/index.ts`). It requires an authenticated
user whose email is in the allowlist stored at the Firestore document
**`adminConfig/reviewers`**, field **`emails`** (an array). Anyone not on that list is rejected
with `permission-denied`, regardless of how they reached the console.

Authorization is therefore **entirely server-side and data-driven** — adding a reviewer is a
Firestore edit, no code change or redeploy.

## Add a reviewer

1. **Create the account.** In the [Firebase Console](https://console.firebase.google.com/project/lea-tongan-speech/authentication/users)
   → Authentication → Users → *Add user*, create an email/password account for the reviewer
   (or have them sign up, then note the email).
2. **Add the email to the allowlist.** In Firestore, open `adminConfig/reviewers` and add the
   reviewer's email to the `emails` array. Create the document with `{ emails: ["…"] }` if it
   doesn't exist yet.
3. That's it — the change takes effect on their next call; `assertReviewer` reads the list fresh
   each time.

## Remove a reviewer

Delete the email from `adminConfig/reviewers.emails`. The account can stay in Authentication —
without an allowlisted email it can sign in but every action returns `permission-denied`.

## Rotate a reviewer password

**Never set or store a reviewer password in this repo, in config, or in chat.** Rotate by
sending a password-reset link the reviewer completes themselves:

- **Firebase Console** → Authentication → Users → the account → *Reset password* (sends a reset
  email), **or**
- send the reset directly via the public browser API key in [`site/config.js`](../site/config.js):

  ```bash
  curl -X POST \
    "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=<firebaseApiKey>" \
    -H "Content-Type: application/json" \
    --data '{"requestType":"PASSWORD_RESET","email":"reviewer@example.com"}'
  ```

  (`firebaseApiKey` is a public browser key, not a secret — see the note in `site/config.js`.)

The reviewer follows the emailed link and chooses a new password. The old password stays valid
until they complete the reset, so treat rotation as done only once they confirm.

## Console exposure — a conscious decision

The public site footer links to the reviewer console (`review.html`). **We keep this link.**

The link's visibility is immaterial to security: the console is only a login form, and every
action behind it is denied server-side for any email not on the `adminConfig/reviewers`
allowlist (see *How the gate works* above). Hiding the link would be security-by-obscurity — the
page is in this public repo and reachable by direct URL regardless — while a visible link is a
small transparency signal that the corpus is human-curated. If the console ever gains a
client-trusted action, revisit this call.
