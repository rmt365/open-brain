// Open Brain - URL Detection
// Extracts URLs from thought text for auto-ingestion.

// Match http:// and https:// URLs. Handles parentheses in paths (Wikipedia-style).
// Stops before trailing punctuation that's not part of the URL.
// The final char allows ) so balanced parens like Foo_(bar) are captured; balanceParens() trims unbalanced ones.
const EXPLICIT_URL_RE = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?}\]]/g;

// Common TLDs for bare domain detection.
const COMMON_TLDS = new Set([
  "com", "org", "net", "io", "co", "dev", "app", "me", "info", "biz",
  "us", "uk", "ca", "au", "de", "fr", "nl", "se", "no", "fi",
  "tv", "cc", "xyz", "tech", "ai", "gg", "fm", "so", "to",
  "studio", "design", "blog", "site", "online", "store", "shop",
]);

// Two-part TLDs like co.uk, com.au
const TWO_PART_TLDS = new Set([
  "co.uk", "com.au", "co.nz", "co.za", "com.br", "co.jp", "co.kr",
]);

// Match word.tld or word.tld/path (but not things inside explicit URLs)
const BARE_DOMAIN_RE = /(?<![/:])(?<!\w)([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.(?:[a-zA-Z]{2,}\.)?[a-zA-Z]{2,}(?:\/[^\s<>"]*[^\s<>".,;:!?)}\\])?)/g;

/**
 * Extract all URLs from text. Returns fully-qualified URLs (bare domains get https:// prepended).
 * Pass 1: explicit http/https URLs.
 * Pass 2: bare domains.
 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];
  const matchedRanges: Array<[number, number]> = [];

  // Pass 1: explicit URLs
  for (const match of text.matchAll(EXPLICIT_URL_RE)) {
    const url = balanceParens(match[0]);
    urls.push(url);
    matchedRanges.push([match.index!, match.index! + match[0].length]);
  }

  // Pass 2: bare domains — skip ranges already matched by Pass 1
  for (const match of text.matchAll(BARE_DOMAIN_RE)) {
    const start = match.index!;
    const end = start + match[0].length;

    // Skip if this overlaps with an explicit URL match
    const overlaps = matchedRanges.some(
      ([rStart, rEnd]) => start >= rStart && start < rEnd
    );
    if (overlaps) continue;

    // Validate the TLD
    const domain = match[0].split("/")[0];
    const parts = domain.split(".");
    const twoPartTld = parts.length >= 3 ? `${parts[parts.length - 2]}.${parts[parts.length - 1]}` : "";
    const singleTld = parts[parts.length - 1];

    if (TWO_PART_TLDS.has(twoPartTld) || COMMON_TLDS.has(singleTld)) {
      urls.push(`https://${balanceParens(match[0])}`);
      matchedRanges.push([start, end]);
    }
  }

  return urls;
}

const URL_ONLY_MAX_REMAINDER = 30;

/**
 * Determine if a message is essentially just a URL (or URLs) with minimal wrapper text.
 * Strips URLs and common prefixes from the text, then checks if the remainder is short.
 */
export function isUrlOnlyMessage(text: string, urls: string[]): boolean {
  if (urls.length === 0) return false;

  let remainder = text;

  // Strip explicit URLs from text
  for (const url of urls) {
    remainder = remainder.replace(url, "");
  }

  // Also strip bare domain versions (without https://) in case the original text had bare domains
  for (const url of urls) {
    const bareDomain = url.replace(/^https?:\/\//, "");
    remainder = remainder.replace(bareDomain, "");
  }

  // Strip common prefixes people use when bookmarking
  remainder = remainder
    .replace(/^(log|save|bookmark|check out|check|look at|read|watch|see|grab|capture)\b/i, "")
    .replace(/\bthis\s+url\b/i, "")
    .replace(/\bthis\s+link\b/i, "")
    .replace(/\bthis\b/i, "")
    .replace(/[:;,\-—–]/g, "")
    .trim();

  return remainder.length <= URL_ONLY_MAX_REMAINDER;
}

/** Strip trailing closing parens that don't have a matching open paren in the URL path. */
function balanceParens(url: string): string {
  let result = url;
  while (result.endsWith(")")) {
    const opens = (result.match(/\(/g) || []).length;
    const closes = (result.match(/\)/g) || []).length;
    if (closes > opens) {
      result = result.slice(0, -1);
    } else {
      break;
    }
  }
  return result;
}
