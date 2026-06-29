/** FNV-1a 32-bit hash: string → uint32 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

/** Mulberry32 PRNG — returns uniform float in [0, 1) */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z = (z ^ (z + Math.imul(z ^ (z >>> 7), z | 61))) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic seed for a chunk: encodes all parameters that affect its content */
export function makeChunkSeed(
  seedPhrase: string,
  generatorVersion: number,
  levelDepth: number,
  chunkX: number,
  chunkY: number,
): number {
  return hashString(`${seedPhrase}:v${generatorVersion}:d${levelDepth}:${chunkX},${chunkY}`);
}
