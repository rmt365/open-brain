// Open Brain - URL Content Summarizer
// Uses LLM provider to generate concise summaries of scraped URL content

import { PromptLoader } from "@p2b/hono-core";
import { join, dirname, fromFileUrl } from "@std/path";
import type { LLMProvider } from "./llm/types.ts";

// ============================================================
// PROMPT LOADER (lazy singleton)
// ============================================================

let promptLoader: PromptLoader | null = null;

function getPromptLoader(): PromptLoader {
  if (!promptLoader) {
    const promptPath = join(
      dirname(fromFileUrl(import.meta.url)),
      "../prompts/url-summarization.yaml"
    );
    promptLoader = new PromptLoader(promptPath, { hotReload: true });
  }
  return promptLoader;
}

// ============================================================
// SUMMARIZER
// ============================================================

const MAX_ARTICLE_LENGTH = 15_000;

/**
 * Summarize URL content using an LLM provider.
 * Returns a plain text summary, or null on error for graceful degradation.
 */
export async function summarizeUrlContent(
  title: string,
  url: string,
  articleText: string,
  provider: LLMProvider,
  model?: string
): Promise<string | null> {
  try {
    const loader = getPromptLoader();

    // Truncate article text to avoid exceeding token limits
    const truncatedText = articleText.length > MAX_ARTICLE_LENGTH
      ? articleText.substring(0, MAX_ARTICLE_LENGTH) + "..."
      : articleText;

    const { system, user } = loader.getPrompt("summarize_url", {
      title,
      url,
      article_text: truncatedText,
    });

    console.log(`[OpenBrain:Summarize] Summarizing "${title}" (${articleText.length} chars, truncated to ${truncatedText.length})`);

    const content = await provider.complete(system, user, model);

    if (!content) {
      console.error("[OpenBrain:Summarize] LLM returned no content");
      return null;
    }

    console.log(`[OpenBrain:Summarize] Generated summary (${content.length} chars) for "${title}"`);
    return content;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:Summarize] Summarization failed: ${msg}`);
    return null;
  }
}
