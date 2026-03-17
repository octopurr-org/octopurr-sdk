/**
 * On-chain metadata encoding/decoding.
 *
 * Single source of truth for compact key mapping used in TokenCreated event.
 * All layers (frontend, backend, recovery) import from here.
 *
 * Adding a new field: add entry to METADATA_KEYS → all layers pick it up.
 */

// ─── Key mapping ─────────────────────────────────────────────────────────────

export interface MetadataKeyDef {
  /** Compact key stored on-chain (e.g. 'd', 'w') */
  compact: string;
  /** Full key used in DB/API (e.g. 'description', 'website') */
  full: string;
  /** Max chars when encoding (truncate, not reject) */
  maxChars: number;
}

/**
 * Ordered list of metadata fields.
 * 'description' is special — stored separately in DB, not in metadata jsonb.
 */
export const METADATA_KEYS: readonly MetadataKeyDef[] = [
  { compact: 'd',  full: 'description',    maxChars: 500 },
  { compact: 'a',  full: 'agent',          maxChars: 128 },
  { compact: 'w',  full: 'website',        maxChars: 128 },
  { compact: 't',  full: 'twitter',        maxChars: 128 },
  { compact: 'tg', full: 'telegram',       maxChars: 128 },
  { compact: 'dc', full: 'discord',        maxChars: 128 },
  { compact: 'gh', full: 'github',         maxChars: 128 },
  { compact: 'bs', full: 'binancesquare',  maxChars: 128 },
  { compact: 'mb', full: 'moltbook',       maxChars: 128 },
] as const;

/** compact → full lookup */
export const COMPACT_TO_FULL: Record<string, string> = Object.fromEntries(
  METADATA_KEYS.map((k) => [k.compact, k.full]),
);

/** full → compact lookup */
export const FULL_TO_COMPACT: Record<string, string> = Object.fromEntries(
  METADATA_KEYS.map((k) => [k.full, k.compact]),
);

// ─── Encode ──────────────────────────────────────────────────────────────────

/**
 * Encode metadata fields into compact JSON string for on-chain storage.
 *
 * @param fields  Record with full keys (e.g. { description: '...', website: '...' })
 * @returns       Compact JSON string (e.g. '{"d":"...","w":"..."}'), or '' if empty
 *
 * Usage (frontend): encodeOnchainMetadata({ description: data.description, website: data.websiteUrl, ... })
 * Usage (backend):  encodeOnchainMetadata({ description: params.description, ...params.socialLinks })
 */
export function encodeOnchainMetadata(fields: Record<string, string | undefined | null>): string {
  const obj: Record<string, string> = {};
  for (const key of METADATA_KEYS) {
    const val = fields[key.full]?.trim();
    if (val) {
      obj[key.compact] = val.slice(0, key.maxChars);
    }
  }
  return Object.keys(obj).length > 0 ? JSON.stringify(obj) : '';
}

// ─── Decode ──────────────────────────────────────────────────────────────────

export interface DecodedMetadata {
  /** Description text (separated because it maps to its own DB column) */
  description: string | null;
  /** Social links / other metadata (maps to DB metadata jsonb column) */
  links: Record<string, string> | null;
}

/**
 * Decode compact JSON string from on-chain event back to full keys.
 *
 * @param compactJson  Raw string from TokenCreated event's tokenMetadata field
 * @returns            Parsed description + links with full key names
 */
export function decodeOnchainMetadata(compactJson: string | undefined | null): DecodedMetadata {
  if (!compactJson?.trim()) return { description: null, links: null };

  let obj: unknown;
  try {
    obj = JSON.parse(compactJson);
  } catch {
    return { description: null, links: null };
  }
  // Type guard: must be a plain object (not null, array, or primitive)
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return { description: null, links: null };
  }
  const record = obj as Record<string, unknown>;

  const rawDesc = record[FULL_TO_COMPACT['description']];
  const description = typeof rawDesc === 'string' ? rawDesc.trim() || null : null;
  const links: Record<string, string> = {};
  for (const key of METADATA_KEYS) {
    if (key.full === 'description') continue;
    const raw = record[key.compact];
    const val = typeof raw === 'string' ? raw.trim() : '';
    if (val) links[key.full] = val;
  }

  return {
    description,
    links: Object.keys(links).length > 0 ? links : null,
  };
}
