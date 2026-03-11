#!/bin/sh
set -e

# Start Ollama in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "[ollama] Waiting for Ollama to start..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/ > /dev/null 2>&1; then
    echo "[ollama] Ollama is ready"
    break
  fi
  sleep 1
done

# Pull embedding model if not present
if ! ollama list 2>/dev/null | grep -q "all-minilm"; then
  echo "[ollama] Pulling all-minilm embedding model..."
  ollama pull all-minilm
  echo "[ollama] all-minilm ready"
else
  echo "[ollama] all-minilm already available"
fi

# Wait for Ollama process
wait $OLLAMA_PID
