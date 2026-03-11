// Open Brain - Thought Classifier
// Uses LLM provider to classify thoughts and extract metadata

import { PromptLoader } from "@p2b/hono-core";
import { join, dirname, fromFileUrl } from "@std/path";
import type { ThoughtType } from "../types/index.ts";
import type { LLMProvider } from "./llm/types.ts";

// ============================================================
// TYPES
// ============================================================

export interface ClassificationResult {
  thought_type: ThoughtType;
  topics: string[];
  confidence: number;
}

const VALID_THOUGHT_TYPES: Set<string> = new Set([
  "note", "idea", "task", "question",
  "observation", "decision", "reference", "reflection",
]);

// ============================================================
// PROMPT LOADER (lazy singleton)
// ============================================================

let promptLoader: PromptLoader | null = null;

function getPromptLoader(): PromptLoader {
  if (!promptLoader) {
    const promptPath = join(
      dirname(fromFileUrl(import.meta.url)),
      "../prompts/thought-classification.yaml"
    );
    promptLoader = new PromptLoader(promptPath, { hotReload: true });
  }
  return promptLoader;
}

// ============================================================
// CLASSIFIER
// ============================================================

/**
 * Classify a thought using an LLM provider.
 * Extracts thought_type, topics, and confidence from the text.
 *
 * Returns null on error for graceful degradation -- thoughts are still
 * captured even if the LLM is unavailable.
 */
export async function classifyThought(
  text: string,
  provider: LLMProvider,
  model?: string
): Promise<ClassificationResult | null> {
  try {
    const loader = getPromptLoader();
    const { system, user } = loader.getPrompt("classify_thought", {
      thought_text: text,
    });

    console.log(`[OpenBrain:Classify] Classifying thought (${text.length} chars)`);

    const content = await provider.complete(system, user, model);

    if (!content) {
      console.error("[OpenBrain:Classify] LLM returned no content");
      return null;
    }

    // Parse JSON from response (may be wrapped in markdown code blocks)
    const parsed = extractJSON(content);
    if (!parsed) {
      console.error(`[OpenBrain:Classify] Failed to parse JSON from response: ${content.substring(0, 200)}`);
      return null;
    }

    // Validate and normalize the result
    return normalizeClassification(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:Classify] Classification failed: ${msg}`);
    return null;
  }
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Extract JSON from an LLM response that may contain markdown code blocks
 */
function extractJSON(text: string): Record<string, unknown> | null {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {
    // Try extracting from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch {
        // fall through
      }
    }

    // Try finding JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // fall through
      }
    }

    return null;
  }
}

/**
 * Validate and normalize a classification result from the LLM
 */
function normalizeClassification(
  raw: Record<string, unknown>
): ClassificationResult | null {
  const thoughtType = String(raw.thought_type || "note");
  const topics = Array.isArray(raw.topics)
    ? raw.topics.map(String).filter(Boolean).slice(0, 5)
    : [];
  const confidence = typeof raw.confidence === "number"
    ? Math.max(0, Math.min(1, raw.confidence))
    : 0.5;

  // Validate thought_type
  const validType = VALID_THOUGHT_TYPES.has(thoughtType)
    ? thoughtType as ThoughtType
    : "note" as ThoughtType;

  console.log(
    `[OpenBrain:Classify] Result: type=${validType}, topics=[${topics.join(", ")}], confidence=${confidence}`
  );

  return {
    thought_type: validType,
    topics,
    confidence,
  };
}
