# 0002 — Consent model: 18+ open-license grant, versioned, forward-only

- **Status:** Accepted (implementation pending backend)
- **Date:** 2026-07-16
- **Related:** [`../CONSENT.md`](../CONSENT.md), [`0001`](./0001-canonical-audio-format.md), corpus schema [`../../data/schema.md`](../../data/schema.md)

## Context

The corpus is public and grows from community-contributed voices. Publishing a person's voice under
an **irreversible** open licence is a legal act, not a UI checkbox — and some contributors may be
minors or otherwise vulnerable. We need a consent model that is honest about irreversibility, keeps
the dataset commercially clean (CC BY 4.0), and does not force us to re-contact contributors when the
terms evolve. Three specific questions had to be answered before the contribution site could be built,
because none can be retrofitted without re-collecting or re-consenting.

## Decision

1. **Explicit CC BY 4.0 grant, framed honestly.** At record time the contributor ticks three
   confirmations — age, own-voice, and the CC BY 4.0 licence — and the copy states plainly that the
   grant is **public, permanent, and cannot be recalled** once a release is published. All three
   booleans + a timestamp + the `consentVersion` are stored on every clip (`consent.*` in the schema).
   The record/submit action is gated on all three being true.

2. **18+ floor; under-18 only via guardian consent.** A CC BY grant is a legal act a minor cannot make
   alone. The floor is **18**, higher than the app's 13+ line, with a guardian-consent path that stays
   **disabled until built** — under-18 contribution is off until there is a real guardian flow.

3. **Versioned, forward-only consent.** Each clip records the exact `consentVersion` it was collected
   under (e.g. `2026-07-16-v1`). If the consent text changes materially, the version bumps; **existing
   clips keep the version they agreed to and are never retroactively relicensed.** New contributions
   use the new version.

4. **Withdrawal is forward-only, and we say so.** A contributor can have their clips excluded from
   **future** releases (contact + their pseudonymous `speakerId`), implemented by moving the clips out
   of `approved`. Already-published releases cannot be recalled — the consent copy states this rather
   than implying a promise we can't keep.

5. **PII firewall.** Contribution requires no legal name/email/phone. The optional `authUid` is
   server-only and stripped from every export; `self_describe` gender carries no free-text field.
   Contributors are warned not to speak personal details into the recording.

## Consequences

- **The dataset stays commercially clean and republishable** — every published clip carries a
  provable CC BY 4.0 grant tied to a consent version.
- **The existing app recordings can never enter this corpus** — they were collected under a different
  promise (app-only) and a different (13+) age line. This is intended (see app-repo ADR-0037).
- **Under-18 voices are excluded for now.** A guardian flow is future work; until then the floor is a
  hard 18+.
- **Three items must be filled before launch** (tracked in `CONSENT.md`): the contact email, the
  guardian flow (or keep under-18 disabled), and a legal review of the grant text.

## Alternatives considered

| Option | Why not |
|---|---|
| **Implicit consent** (contributing = agreeing, no checkboxes) | Not defensible for an irreversible public licence, especially with possible minors. Rejected. |
| **13+ to match the app** | A 13-year-old can't grant a CC BY licence; the app's 13+ line governs *use of a free app*, not *licensing one's voice publicly*. Rejected for this corpus. |
| **One global consent, unversioned** | A later change to the terms would silently apply to old clips or force re-contacting everyone. Versioning per clip avoids both. Rejected. |
| **Full withdrawal / right-to-erasure from all releases** | Impossible to honour once a public dataset is mirrored/downloaded; promising it would be dishonest. We promise forward-only exclusion and say so. Rejected. |
