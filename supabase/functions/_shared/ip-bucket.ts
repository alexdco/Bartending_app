// Client IP bucketing for the AI quota's per IP guest limit.
// Spec: docs/specs/0034-ai-quota-abuse-hardening/index.md (IP bucket derivation, IP source)
//
// Pure helpers with no jsr:/npm: imports, so vitest can import them as well as Deno.
// Only `cf-connecting-ip` is trusted: Cloudflare sets it at the edge and rejects a
// request that sends its own. `x-forwarded-for` ends in a rotating AWS load balancer
// address, and `true-client-ip` / `forwarded` pass through from the client, so none
// of them are ever read.

export const UNKNOWN_IP_BUCKET = "unknown";

type ParsedIp =
  | { readonly kind: "v4"; readonly octets: readonly number[] }
  | { readonly kind: "v6"; readonly hextets: readonly number[] };

type HeaderSource = { get(name: string): string | null };

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET_PATTERN = /^[0-9a-f]{1,4}$/;

function parseIpv4(value: string): readonly number[] | null {
  const match = IPV4_PATTERN.exec(value);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function parseHextets(groups: readonly string[]): readonly number[] | null {
  return groups.every((group) => HEXTET_PATTERN.test(group))
    ? groups.map((group) => parseInt(group, 16))
    : null;
}

// Expands `::`, and an embedded IPv4 tail (`::ffff:1.2.3.4`) into two hextets.
function parseIpv6(value: string): readonly number[] | null {
  const lastColon = value.lastIndexOf(":");
  const tail = value.slice(lastColon + 1);
  const tailOctets = tail.includes(".") ? parseIpv4(tail) : null;
  if (tail.includes(".") && !tailOctets) return null;

  const head = tailOctets ? value.slice(0, lastColon + 1) + "0:0" : value;
  const tailHextets = tailOctets
    ? [(tailOctets[0] << 8) | tailOctets[1], (tailOctets[2] << 8) | tailOctets[3]]
    : [];

  const halves = head.split("::");
  if (halves.length > 2) return null;

  const splitGroups = (part: string): readonly string[] => (part === "" ? [] : part.split(":"));
  const left = parseHextets(splitGroups(halves[0]));
  const right = halves.length === 2 ? parseHextets(splitGroups(halves[1])) : [];
  if (!left || !right) return null;

  const missing = 8 - left.length - right.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;

  const hextets = [...left, ...Array<number>(missing).fill(0), ...right];
  return tailOctets ? [...hextets.slice(0, 6), ...tailHextets] : hextets;
}

// Strips brackets, a port, and an IPv6 zone ID before parsing.
function stripDecorations(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  const unbracketed = trimmed.startsWith("[")
    ? trimmed.slice(1, trimmed.indexOf("]") === -1 ? undefined : trimmed.indexOf("]"))
    : /^[^:]+:\d+$/.test(trimmed)
      ? trimmed.slice(0, trimmed.lastIndexOf(":"))
      : trimmed;
  const zoneAt = unbracketed.indexOf("%");
  return zoneAt === -1 ? unbracketed : unbracketed.slice(0, zoneAt);
}

function isIpv4Mapped(hextets: readonly number[]): boolean {
  return hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === 0xffff;
}

export function parseIp(raw: string): ParsedIp | null {
  const value = stripDecorations(raw);
  if (value === "") return null;

  const octets = parseIpv4(value);
  if (octets) return { kind: "v4", octets };

  if (!value.includes(":")) return null;
  const hextets = parseIpv6(value);
  if (!hextets) return null;

  return isIpv4Mapped(hextets)
    ? {
        kind: "v4",
        octets: [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff],
      }
    : { kind: "v6", hextets };
}

// The client IP as Supabase's edge saw it, or null when the header is absent or
// does not hold exactly one IP.
export function clientIpFromHeaders(headers: HeaderSource): string | null {
  const value = headers.get("cf-connecting-ip");
  if (value === null) return null;
  return parseIp(value) ? value.trim() : null;
}

// IPv4 → the full address; IPv6 → its /64 prefix; anything else → "unknown".
export function ipBucket(ip: string | null): string {
  const parsed = ip === null ? null : parseIp(ip);
  if (!parsed) return UNKNOWN_IP_BUCKET;
  if (parsed.kind === "v4") return parsed.octets.join(".");
  const prefix = parsed.hextets
    .slice(0, 4)
    .map((hextet) => hextet.toString(16))
    .join(":");
  return `${prefix}::/64`;
}

// HMAC SHA-256 of the bucket, keyed with IP_HASH_SECRET, as lowercase hex.
export async function hashIpBucket(bucket: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(bucket));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
