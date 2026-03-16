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

    // Aggressive whitespace cleanup
    text = cleanWhitespace(text, title);

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
  // Remove entire elements that never contain useful content
  let text = html
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Convert block elements to newlines
  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|h[1-6]|li|tr|blockquote|article|section|figcaption|figure|main)[^>]*>/gi, "\n")
    .replace(/<\/?(ul|ol|table|tbody|thead|tfoot)[^>]*>/gi, "\n");

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

/**
 * Clean extracted text: collapse whitespace, remove junk lines,
 * deduplicate the title from the body.
 */
function cleanWhitespace(text: string, title: string): string {
  // Normalize line endings
  let cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Trim each line and filter out empty/very short lines (likely nav fragments)
  const lines = cleaned
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);

  // Remove lines that are just the title repeated (common in page headers)
  const titleNorm = title.toLowerCase().trim();
  const dedupedLines = lines.filter((line, i) => {
    // Allow the title to appear once (skip the first occurrence only after the first few lines)
    if (i < 5 && line.toLowerCase().trim() === titleNorm) return false;
    return true;
  });

  // Rejoin and collapse multiple blank lines
  cleaned = dedupedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Remove very short fragment lines at the start (nav remnants like "Home", "About")
  const finalLines = cleaned.split("\n");
  let contentStart = 0;
  for (let i = 0; i < Math.min(finalLines.length, 10); i++) {
    if (finalLines[i].length > 30) break;
    contentStart = i + 1;
  }

  // Only skip if we found real content after the fragments
  if (contentStart > 0 && contentStart < finalLines.length) {
    cleaned = finalLines.slice(contentStart).join("\n").trim();
  }

  return cleaned;
}
