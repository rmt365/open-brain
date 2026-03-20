/**
 * Context Injector
 * Auto-appends user preferences and other ambient context to tool responses.
 * Cached to avoid repeated API calls within a short window.
 */

import { getPreferencesBlock } from "./open-brain-client.js";

let cachedBlock: string | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getPreferencesContext(): Promise<string | null> {
  const now = Date.now();
  if (cachedBlock !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedBlock;
  }

  try {
    const response = await getPreferencesBlock();
    if (response.success && response.data?.block) {
      cachedBlock = response.data.block;
    } else {
      cachedBlock = null;
    }
    cacheTimestamp = now;
    return cachedBlock;
  } catch {
    // Don't fail the tool call if preferences can't be fetched
    return cachedBlock; // return stale cache if available
  }
}

/**
 * Appends a preferences context block to a tool response text.
 * Returns the original text if no preferences are available.
 */
export async function injectContext(text: string): Promise<string> {
  const prefs = await getPreferencesContext();
  if (!prefs) return text;

  return `${text}\n\n--- Context: User Preferences ---\n${prefs}`;
}
