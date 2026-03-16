// Open Brain - URL Detection
// Extracts URLs from thought text for auto-ingestion.

// Match http:// and https:// URLs. Handles parentheses in paths (Wikipedia-style).
// Stops before trailing punctuation that's not part of the URL.
// The final char allows ) so balanced parens like Foo_(bar) are captured; balanceParens() trims unbalanced ones.
const EXPLICIT_URL_RE = /https?:\/\/[^\s<>\"]+[^\s<>\".,;:!?}\]]/g;

/**
 * Extract all URLs from text. Returns fully-qualified URLs (bare domains get https:// prepended).
 * Pass 1: explicit http/https URLs.
 * Pass 2: bare domains (added later).
 */
export function extractUrls(text: string): string[] {
  const urls: string[] = [];

  // Pass 1: explicit URLs
  const explicitMatches = text.match(EXPLICIT_URL_RE) || [];
  for (const match of explicitMatches) {
    // Balance parentheses: if URL has unmatched trailing ), strip it
    urls.push(balanceParens(match));
  }

  return urls;
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
