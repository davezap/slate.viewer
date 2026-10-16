// Small fuzzy matcher for Go to File: every query character must appear in order.

export interface FuzzyHit { item: string; score: number }

export function fuzzyFilter(items: string[], query: string, limit = 50): FuzzyHit[] {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return items.slice(0, limit).map(item => ({ item, score: 0 }));
  const hits: FuzzyHit[] = [];
  for (const item of items) {
    const score = scoreOf(item, q);
    if (score > -Infinity) hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score || a.item.length - b.item.length);
  return hits.slice(0, limit);
}

function scoreOf(item: string, q: string): number {
  const text = item.toLowerCase();
  const nameStart = text.lastIndexOf('/') + 1;
  let score = 0;
  let pos = 0;
  let previous = -2;
  for (const ch of q) {
    const found = text.indexOf(ch, pos);
    if (found < 0) return -Infinity;
    if (found === previous + 1) score += 3;                      // consecutive characters
    if (found >= nameStart) score += 2;                          // inside the file name
    if (found === nameStart || /[\s/_.-]/.test(text[found - 1] ?? '/')) score += 4; // word start
    score -= (found - pos) * 0.05;
    previous = found;
    pos = found + 1;
  }
  if (text.slice(nameStart).startsWith(q)) score += 10;
  return score;
}
