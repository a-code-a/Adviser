import { EMBEDDING_DIMENSIONS } from "@/lib/core/config";

export function buildHashEmbedding(input: string) {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const normalized = input.toLowerCase();

  for (let index = 0; index < normalized.length; index += 1) {
    const code = normalized.charCodeAt(index);
    const bucket = index % EMBEDDING_DIMENSIONS;
    vector[bucket] += ((code % 61) - 30) / 30;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}
