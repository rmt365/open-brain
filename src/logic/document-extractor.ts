// Open Brain - Document Extractor
// Uses Claude vision to extract structured data from images and PDFs

import type { LLMProvider, ContentBlock } from "./llm/types.ts";

export interface ExtractedDocument {
  document_type: string;
  title: string;
  extracted_text: string;
  date: string | null;
  vendor: string | null;
  total_amount: string | null;
  currency: string | null;
  details: Record<string, unknown>;
}

const EXTRACTION_SYSTEM_PROMPT = `You are a document data extraction assistant. Analyze the provided document (image or PDF) and extract structured information.

Auto-detect the document type from: receipt, invoice, warranty, agreement, manual, statement, letter, other.

Return a JSON object with these fields:
{
  "document_type": "<type>",
  "title": "<brief descriptive title for this document>",
  "extracted_text": "<full OCR text from the document>",
  "date": "<document date in YYYY-MM-DD format, or null>",
  "vendor": "<business/vendor/company name, or null>",
  "total_amount": "<total amount with currency symbol e.g. $1,234.56, or null>",
  "currency": "<3-letter currency code e.g. USD, CAD, or null>",
  "details": {<type-specific fields>}
}

Type-specific details:
- receipt/invoice: include "line_items" array [{description, quantity, amount}], "tax", "subtotal", "payment_method"
- warranty: include "coverage", "expiry_date", "serial_number", "product"
- agreement/contract: include "parties" array, "effective_date", "terms_summary"
- statement: include "period", "account_number", "balance"
- other: include any relevant structured fields

Return ONLY the JSON object, no additional text.`;

/**
 * Extract structured data from a document using Claude vision.
 * Returns null on failure for graceful degradation.
 */
export async function extractDocument(
  fileData: Uint8Array,
  mimeType: string,
  provider: LLMProvider,
  context?: string,
  model?: string
): Promise<ExtractedDocument | null> {
  try {
    const base64 = uint8ArrayToBase64(fileData);

    const content: ContentBlock[] = [];

    if (mimeType === "application/pdf") {
      content.push({ type: "document", media_type: mimeType, data: base64 });
    } else {
      content.push({ type: "image", media_type: mimeType, data: base64 });
    }

    if (context) {
      content.push({ type: "text", text: `Additional context from user: ${context}` });
    }

    content.push({ type: "text", text: "Extract structured data from this document." });

    console.log(`[OpenBrain:DocExtract] Extracting from ${mimeType} (${fileData.length} bytes)`);

    const response = await provider.completeWithMedia(
      EXTRACTION_SYSTEM_PROMPT,
      content,
      model
    );

    if (!response) {
      console.error("[OpenBrain:DocExtract] LLM returned no content");
      return null;
    }

    const parsed = extractJSON(response);
    if (!parsed) {
      console.error(`[OpenBrain:DocExtract] Failed to parse JSON: ${response.substring(0, 200)}`);
      return null;
    }

    return normalizeExtraction(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:DocExtract] Extraction failed: ${msg}`);
    return null;
  }
}

function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/** Extract JSON from LLM response (same pattern as classifier.ts) */
function extractJSON(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text.trim());
  } catch {
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (codeBlockMatch) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch { /* fall through */ }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch { /* fall through */ }
    }

    return null;
  }
}

function normalizeExtraction(raw: Record<string, unknown>): ExtractedDocument {
  return {
    document_type: String(raw.document_type || "other"),
    title: String(raw.title || "Uploaded document"),
    extracted_text: String(raw.extracted_text || ""),
    date: raw.date ? String(raw.date) : null,
    vendor: raw.vendor ? String(raw.vendor) : null,
    total_amount: raw.total_amount ? String(raw.total_amount) : null,
    currency: raw.currency ? String(raw.currency) : null,
    details: (typeof raw.details === "object" && raw.details !== null)
      ? raw.details as Record<string, unknown>
      : {},
  };
}
