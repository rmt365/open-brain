// Open Brain - URL Content Extractor
// Fetches a URL and extracts readable text content.

export interface ExtractedContent {
  title: string;
  text: string;
  url: string;
  fetchedAt: string;
}

/**
 * Fetch a URL and extract its text content.
 * Strips HTML tags and extracts the readable body text.
 * Returns null on failure for graceful degradation.
 */
export async function extractUrlContent(url: string): Promise<ExtractedContent | null> {
  try {
    console.log(`[OpenBrain:Extract] Fetching ${url}`);

    const response = await fetch(url, {
      headers: {
        "User-Agent": "OpenBrain/1.0 (knowledge-capture)",
        "Accept": "text/html, application/xhtml+xml, text/plain",
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error(`[OpenBrain:Extract] HTTP ${response.status} for ${url}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    const rawBody = await response.text();

    let text: string;
    let title: string;

    if (contentType.includes("text/html") || contentType.includes("xhtml")) {
      title = extractTitle(rawBody) || new URL(url).hostname;
      text = stripHtml(rawBody);
    } else {
      // Plain text or other — use as-is
      title = new URL(url).hostname;
      text = rawBody;
    }

    // Clean up whitespace
    text = text
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (text.length === 0) {
      console.error(`[OpenBrain:Extract] No content extracted from ${url}`);
      return null;
    }

    console.log(`[OpenBrain:Extract] Extracted ${text.length} chars from ${url} (title: "${title}")`);

    return {
      title,
      text,
      url,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:Extract] Failed to extract ${url}: ${msg}`);
    return null;
  }
}

/** Extract <title> from HTML */
function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].trim().replace(/\s+/g, " ") : null;
}

/** Strip HTML tags and decode basic entities, keeping text content. */
function stripHtml(html: string): string {
  // Remove script, style, nav, footer, header elements entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "");

  // Convert block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr|blockquote|article|section)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|tbody|thead)[^>]*>/gi, "\n");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
    .replace(/&[a-zA-Z]+;/g, " "); // catch-all for remaining entities

  return text;
}
