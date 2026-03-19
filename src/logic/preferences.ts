// Open Brain - Preference Extraction
// Uses LLM to parse natural language into structured preference fields

import type { LLMProvider } from "./llm/types.ts";
import type { ConstraintType } from "../types/index.ts";

export interface ExtractedPreference {
  preference_name: string;
  domain: string;
  reject: string;
  want: string;
  constraint_type: ConstraintType;
}

const VALID_CONSTRAINT_TYPES = new Set([
  "domain rule",
  "quality standard",
  "business logic",
  "formatting",
]);

const SYSTEM_PROMPT = `You extract structured taste preferences from natural language.

Given a user's text describing what they like or dislike, extract:
- preference_name: short label (2-5 words)
- domain: category like "design", "writing", "code", "food", "general" etc.
- reject: what they don't want (the negative)
- want: what they do want (the positive)
- constraint_type: one of "domain rule", "quality standard", "business logic", "formatting"

Return ONLY valid JSON, no markdown or explanation.

Example input: "I like minimalist design, not cluttered"
Example output: {"preference_name":"minimalist design","domain":"design","reject":"cluttered, busy layouts","want":"clean, minimalist design with ample whitespace","constraint_type":"quality standard"}

Example input: "I prefer concise writing, not verbose"
Example output: {"preference_name":"concise writing","domain":"writing","reject":"verbose, wordy prose","want":"concise, direct writing","constraint_type":"quality standard"}`;

/**
 * Extract a structured preference from natural language using an LLM.
 * Returns null if extraction fails (graceful degradation).
 */
export async function extractPreference(
  text: string,
  provider: LLMProvider,
  model?: string,
): Promise<ExtractedPreference | null> {
  try {
    console.log(`[OpenBrain:Pref] Extracting preference from: "${text.substring(0, 80)}"`);

    const content = await provider.complete(SYSTEM_PROMPT, text, model);
    if (!content) {
      console.error("[OpenBrain:Pref] LLM returned no content");
      return null;
    }

    const parsed = extractJSON(content);
    if (!parsed) {
      console.error(`[OpenBrain:Pref] Failed to parse JSON: ${content.substring(0, 200)}`);
      return null;
    }

    return normalizePreference(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:Pref] Extraction failed: ${msg}`);
    return null;
  }
}

/**
 * Extract JSON from an LLM response that may contain markdown code blocks.
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
 * Validate and normalize extracted preference fields.
 */
function normalizePreference(raw: Record<string, unknown>): ExtractedPreference | null {
  const name = String(raw.preference_name || "").trim();
  const domain = String(raw.domain || "general").trim();
  const reject = String(raw.reject || "").trim();
  const want = String(raw.want || "").trim();
  const constraintType = String(raw.constraint_type || "quality standard").trim();

  if (!name || !reject || !want) {
    console.error("[OpenBrain:Pref] Missing required fields (name, reject, or want)");
    return null;
  }

  const validConstraint = (VALID_CONSTRAINT_TYPES.has(constraintType)
    ? constraintType
    : "quality standard") as ConstraintType;

  console.log(`[OpenBrain:Pref] Extracted: "${name}" (${domain}) — want: "${want}", reject: "${reject}"`);

  return {
    preference_name: name,
    domain: domain || "general",
    reject,
    want,
    constraint_type: validConstraint,
  };
}
