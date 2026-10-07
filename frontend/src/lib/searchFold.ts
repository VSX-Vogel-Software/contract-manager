/**
 * Faltung fuer die Suche - gleiche Regeln wie `fold()` / `cm_fold()` im
 * Backend: klein, ä→ae, ö→oe, ü→ue, ß→ss, uebrige Akzente weg, Bindestriche
 * und Satzzeichen werden Leerzeichen, Mehrfach-Leerzeichen zusammengezogen.
 * Damit findet "Mueller" "Müller" und umgekehrt.
 */

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Buchstaben ohne NFD-Zerlegung, die `unaccent` trotzdem vereinfacht. */
const UNACCENT_EXTRA: Record<string, string> = { ł: 'l', đ: 'd', ø: 'o', æ: 'ae', œ: 'oe', ı: 'i' }

/** Faltet ein einzelnes Zeichen (Basiszeichen plus kombinierende Zeichen). */
function foldUnit(unit: string): string {
  return unit
    .normalize('NFC')
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łđøæœı]/g, (c) => UNACCENT_EXTRA[c])
    .replace(/[^\p{L}\p{N}]/gu, ' ')
}

/** Zerlegt in Basiszeichen samt folgender kombinierender Zeichen (NFD-Eingaben). */
function units(text: string): string[] {
  return text.match(/\P{M}\p{M}*|\p{M}+/gu) ?? []
}

export function searchFold(text: string): string {
  return units(text).map(foldUnit).join('').replace(/\s+/g, ' ').trim()
}

/** Woerter der Anfrage wie im Backend: gefaltet, mind. 2 Zeichen, hoechstens 6. */
export function searchTokens(query: string): string[] {
  const seen = new Set<string>()
  for (const token of searchFold(query).split(' ')) {
    if (token.length >= 2) seen.add(token)
  }
  return Array.from(seen).slice(0, 6)
}

/** Passt `text` zu allen Woertern der Anfrage? (Reihenfolge egal) */
export function matchesAllTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false
  const folded = searchFold(text)
  return tokens.every((token) => folded.includes(token))
}

export interface HighlightSegment {
  text: string
  match: boolean
}

/**
 * Zerlegt `text` in Abschnitte, markiert die Fundstellen der Anfrage-Woerter.
 * Verglichen wird gefaltet, markiert wird im Originaltext: "Mueller" markiert
 * "Müller", "strasse" markiert "Straße".
 */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const tokens = searchTokens(query)
  if (!text) return []
  if (tokens.length === 0) return [{ text, match: false }]

  // Gefalteter Text mit Rueckverweis je gefaltetem Zeichen auf den Original-Abschnitt
  let folded = ''
  const origStart: number[] = []
  const origEnd: number[] = []
  let pos = 0
  for (const unit of units(text)) {
    const f = foldUnit(unit)
    for (let i = 0; i < f.length; i++) {
      origStart.push(pos)
      origEnd.push(pos + unit.length)
    }
    folded += f
    pos += unit.length
  }

  const marked = new Array<boolean>(text.length).fill(false)
  for (const token of tokens) {
    let from = folded.indexOf(token)
    while (from !== -1) {
      const start = origStart[from]
      const end = origEnd[from + token.length - 1]
      for (let i = start; i < end; i++) marked[i] = true
      from = folded.indexOf(token, from + 1)
    }
  }

  const segments: HighlightSegment[] = []
  for (let i = 0; i < text.length; i++) {
    const last = segments[segments.length - 1]
    if (last && last.match === marked[i]) last.text += text[i]
    else segments.push({ text: text[i], match: marked[i] })
  }
  return segments
}
