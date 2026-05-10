// Cyrillic → Latin transliteration for URL-safe slugs.
// Roughly follows BGN/PCGN (passport-style) with adjustments for SEO readability.

const MAP: Record<string, string> = {
  а:"a", б:"b", в:"v", г:"g", д:"d", е:"e", ё:"yo", ж:"zh", з:"z",
  и:"i", й:"y", к:"k", л:"l", м:"m", н:"n", о:"o", п:"p", р:"r",
  с:"s", т:"t", у:"u", ф:"f", х:"h", ц:"ts", ч:"ch", ш:"sh", щ:"sch",
  ъ:"", ы:"y", ь:"", э:"e", ю:"yu", я:"ya",
}

export function transliterate(s: string): string {
  let out = ""
  for (const ch of s.toLowerCase()) out += ch in MAP ? MAP[ch] : ch
  return out
}

// SEO-friendly slug: transliterate, lowercase, only [a-z0-9_-], collapse dashes.
export function slugify(s: string): string {
  return transliterate(s)
    .replace(/[^a-z0-9_\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}
