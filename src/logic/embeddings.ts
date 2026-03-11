// Open Brain - Embedding Client
// Uses Ollama /api/embed endpoint for generating 384-dim embeddings

/**
 * Generate a 384-dimensional embedding vector for a text string.
 * Calls Ollama's /api/embed endpoint (all-minilm model, 384 dimensions).
 *
 * Returns null on error for graceful degradation -- thoughts are still
 * captured even if the embedding service is unavailable.
 */
export async function generateEmbedding(
  text: string,
  ollamaUrl: string,
  model: string = "all-minilm"
): Promise<Float32Array | null> {
  try {
    const url = `${ollamaUrl}/api/embed`;
    console.log(`[OpenBrain:Embed] POST ${url} model=${model} (${text.length} chars)`);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[OpenBrain:Embed] HTTP ${response.status}: ${errorText}`);
      return null;
    }

    const result = await response.json() as {
      embeddings: number[][];
      model: string;
    };

    if (!result.embeddings || result.embeddings.length === 0) {
      console.error("[OpenBrain:Embed] Empty embeddings in response");
      return null;
    }

    const embedding = result.embeddings[0];
    console.log(
      `[OpenBrain:Embed] Generated ${embedding.length}-dim embedding (model: ${result.model})`
    );

    return new Float32Array(embedding);
  } catch (error) {
    // Graceful degradation: log and return null
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[OpenBrain:Embed] Failed to generate embedding: ${msg}`);
    return null;
  }
}
