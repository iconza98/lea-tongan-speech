/** Validate the `meta` JSON a contributor submits alongside their audio.
 *  Mirrors data/schema.md (clip doc) + docs/adr/0002 (consent model). */

const ISLANDS = new Set([
  "tongatapu", "vavau", "haapai", "eua", "niuatoputapu", "niuafoou", "diaspora", "other",
]);
const AGE_BANDS = new Set(["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]);
const GENDERS = new Set(["female", "male", "nonbinary", "self_describe"]);

export interface ContributionMeta {
  promptId: string;
  transcript: string;
  english: string;
  speakerId: string;
  demographics: { island: string | null; ageBand: string | null; gender: string | null };
  consent: {
    version: string;
    confirmedAge: boolean;
    confirmedOwnVoice: boolean;
    confirmedLicense: boolean;
    at: string;
  };
}

export class ValidationError extends Error {}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new ValidationError(`missing/invalid ${field}`);
  return v;
}

/** Optional enum: null/empty allowed (demographics are optional); an unknown value is rejected. */
function optEnum(v: unknown, allowed: Set<string>, field: string): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || !allowed.has(v)) throw new ValidationError(`invalid ${field}`);
  return v;
}

export function validateMeta(raw: unknown): ContributionMeta {
  if (typeof raw !== "object" || raw === null) throw new ValidationError("meta must be an object");
  const m = raw as Record<string, unknown>;
  const demo = (m.demographics ?? {}) as Record<string, unknown>;
  const consent = m.consent as Record<string, unknown> | undefined;
  if (!consent) throw new ValidationError("missing consent");

  // ADR-0002: all three confirmations must be TRUE, and a version must be present.
  if (consent.confirmedAge !== true) throw new ValidationError("age not confirmed");
  if (consent.confirmedOwnVoice !== true) throw new ValidationError("own-voice not confirmed");
  if (consent.confirmedLicense !== true) throw new ValidationError("licence not confirmed");

  return {
    promptId: str(m.promptId, "promptId"),
    transcript: str(m.transcript, "transcript"),
    english: str(m.english, "english"),
    speakerId: str(m.speakerId, "speakerId"),
    demographics: {
      island: optEnum(demo.island, ISLANDS, "island"),
      ageBand: optEnum(demo.ageBand, AGE_BANDS, "ageBand"),
      gender: optEnum(demo.gender, GENDERS, "gender"),
    },
    consent: {
      version: str(consent.version, "consent.version"),
      confirmedAge: true,
      confirmedOwnVoice: true,
      confirmedLicense: true,
      at: typeof consent.at === "string" ? consent.at : new Date().toISOString(),
    },
  };
}
