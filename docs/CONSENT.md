<!--
DRAFT v0.1 — consentVersion = "2026-07-16-v1"
STATUS: needs project-owner review AND, given it is an irrevocable public-license grant
(potentially from minors/vulnerable contributors), ideally a lawyer's review before launch.
This is not legal advice.
-->

# Contribute your voice — Consent & License

**Malō e lelei, and thank you for helping build an open voice for the Tongan language.**

This page explains, in plain language, what happens when you record with us and what
you are agreeing to. Please read it before you record. You must agree to continue.

## What we collect

When you contribute, we collect:

- **Your voice recording** — the audio of you reading a Tongan phrase we show you.
- **The text you read** — the Tongan sentence, and its English translation.
- **A random contributor ID** — so we can group the clips from one person. This is not your name.
- **Optional details you choose to add** — your Tongan island/dialect, an age range, and gender.
  These are **always optional**. You can skip every one of them and still contribute.

We do **not** ask for your legal name, email, phone number, or address in order to contribute.
Please do **not** say your full name, address, or other personal details *inside* the recording.

## What we use it for

Your recording and its text become part of an **open Tongan speech dataset**. We use this dataset to
build and freely share language tools for Tongan, including:

- **Text-to-speech** (a computer voice that reads Tongan aloud),
- **Speech-to-text** (turning spoken Tongan into written Tongan), and
- **Tongan → English translation.**

Because Tongan is under-served by mainstream technology, we are making this a **public, open resource** so
that anyone — researchers, teachers, app-makers, and the Tongan community — can use and improve it.

## What you are agreeing to (the important part)

By contributing, you agree to release your recording, its text, and any optional details you added
under the **Creative Commons Attribution 4.0 licence (CC BY 4.0)**. In plain terms, this means:

- **Anyone may use it** — including for **commercial** projects — as long as they **credit the project**.
- **It becomes public and downloadable.** Your recording will be published in a dataset that anyone can
  download, copy, and keep.
- **This grant is permanent and cannot be taken back.** Once a version of the dataset is published, copies
  may exist on other people's computers forever. We cannot force those copies to be deleted.
- **You keep your own rights too.** You are giving permission, not giving up ownership of your own voice —
  you can still use your recordings however you like.

You confirm that the voice in the recording is **your own**, and that you have the right to give this permission.

## Withdrawing

You may change your mind and ask us to remove your clips **from future versions** of the dataset — email
**[CONTACT EMAIL — TBD]** with your contributor ID. We will remove them from the next release and stop
using them. But we **cannot** recall copies that have already been downloaded or published in an earlier
release. So please only contribute if you are comfortable with your voice being public.

## Age

You must be **18 or older** to contribute, because giving this licence is a legal decision.

If you are **under 18**, a parent or legal guardian must read this page and give consent on your behalf
before you record. **[Guardian flow — TBD: how we capture this. Until built, under-18 contribution is disabled.]**

## Compensation

Contribution is **voluntary and unpaid.** You will not be paid for your recordings. You are contributing them
as a gift to the Tongan language community.

## How your data is handled

- Recordings are stored securely and reviewed by a person before being published, to check quality and remove
  anything that shouldn't be there.
- We only publish clips that pass review. A clip you submit may be rejected and never published.
- Optional demographic details, if you provide them, are published *with* the dataset (they make the dataset
  more useful) — so treat them as public too, and skip them if you'd prefer they stay private.
- Questions or removal requests: **[CONTACT EMAIL — TBD]**.

---

## Short in-flow consent (the checkboxes the contributor actually sees)

> Before you record, please confirm:
>
> - [ ] I am **18 or older** (or a parent/guardian consenting for someone under 18).
> - [ ] The voice I record is **my own** and I have the right to share it.
> - [ ] I agree to release my recording and its text under **CC BY 4.0** — a public, permanent, open licence
>       that lets **anyone** (including commercial users) use it **with credit**, and I understand
>       **this cannot be undone** once published.
>
> I have read the [full consent & licence terms](./CONSENT.md).
>
> **[ Agree and start recording ]**

<!--
IMPLEMENTATION NOTES (not shown to contributors):
- Persist consentVersion = "2026-07-16-v1" on EVERY clip doc. If this text changes materially,
  bump the version; clips keep the version they agreed to. Never relicense old clips under a new version.
- Gate the record button on all three checkboxes being ticked.
- Store the three boolean confirmations + timestamp + consentVersion alongside the clip.
- TBD before launch: contact email, guardian-consent flow (or keep under-18 disabled for v1),
  and confirm CC BY 4.0 is the final dataset licence.
-->
