# 0003 — Region strategy: data in Sydney, compute in us-west1

- **Status:** Accepted
- **Date:** 2026-07-16
- **Related:** [`0001`](./0001-canonical-audio-format.md), [`0002`](./0002-consent-model.md)

## Context

Two regional choices, with different reversibility:

- **Data region (Firestore + the corpus Storage bucket) is permanent.** Once a database/bucket is
  created it cannot be moved. We chose **australia-southeast1 (Sydney)** because the write-heavy,
  latency-sensitive path is *contribution* — native speakers in Tonga, NZ, Australia, and the Pacific
  recording and uploading — and because the recordings and contributor metadata are best kept resident
  near that community.
- **Cloud Functions region is independent and redeployable.** Functions are stateless; their region
  can be changed with a redeploy. So it is a free variable to optimise separately from the data.

The functions' natural pull is toward the project's broader ecosystem, which is **US-based**: the
model pipeline (ZONOS2 / Whisper training and serving), Hugging Face distribution, Modal GPU compute,
and most open-dataset/model consumers (researchers). The accept pipeline's calls to Firestore/Storage
are **low-frequency** (one round of writes per contribution, one per review), not per-request hot
paths, so co-locating functions with the data is not critical.

## Decision

- **Data (Firestore + `lea-tongan-speech-corpus` bucket): australia-southeast1 (Sydney).** Permanent.
- **Cloud Functions (`submitContribution`, `acceptClip`, `rejectClip`): us-west1 (Oregon).**
  Set via `setGlobalOptions({ region: "us-west1" })`; the hosting rewrite `/api/submit` targets us-west1.

Compute lives near the US model/tooling ecosystem; contributor data stays resident in Sydney near the
speaker community. This is a deliberate data/compute split, not an oversight.

## Consequences

- **Cross-region hop on each DB/Storage call** (functions us-west1 ↔ data australia-southeast1): adds
  roughly ~150 ms per operation. Acceptable, because submit/accept are infrequent, human-paced actions
  — not a high-QPS request path — and a contributor's perceived latency is dominated by the audio
  upload, not the metadata write.
- **Small inter-region egress cost** for the bytes functions move between Oregon and Sydney.
- **Data residency stays in Australia** — contributor recordings + metadata remain in-region for the
  Pacific community, independent of where compute runs.
- **Reversible if needed.** If submit latency ever matters more than ecosystem proximity, the functions
  can be redeployed to australia-southeast1 with no data migration (change `setGlobalOptions` region +
  the hosting rewrite, redeploy, re-grant invoker). The *data* region cannot move, which is why the
  permanent choice (Sydney) was made for the community and the flexible choice (us-west1) for compute.

## Alternatives considered

| Option | Why not (for now) |
|---|---|
| **Functions in australia-southeast1** (co-located with data) | Lowest DB/Storage latency, but puts compute far from the US model/tooling ecosystem the project leans on. Kept as the fallback if submit latency ever dominates. |
| **Functions in us-central1** (Firebase default, the initial deploy) | No particular advantage here; us-west1 is closer to west-coast ML infrastructure. Superseded. |
| **Move data to a US region to co-locate everything** | Impossible without recreating Firestore/bucket (permanent), and it would move contributor data out of the Pacific region. Rejected. |
