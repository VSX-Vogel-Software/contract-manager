import { describe, it, expect } from 'vitest'
import { highlightSegments, matchesAllTokens, searchFold, searchTokens } from './searchFold'

/** Markierte Abschnitte als Liste - liest sich im Test leichter. */
const marks = (text: string, query: string) =>
  highlightSegments(text, query).filter((s) => s.match).map((s) => s.text)

describe('searchFold', () => {
  it('faltet Umlaute und ß wie das Backend', () => {
    expect(searchFold('Müller')).toBe('mueller')
    expect(searchFold('GRÖẞE Straße')).toBe('groesse strasse')
    expect(searchFold('Äpfel Öl Übel')).toBe('aepfel oel uebel')
  })

  it('entfernt uebrige Akzente', () => {
    expect(searchFold('Café Crème Ñandú Łódź')).toBe('cafe creme nandu lodz')
  })

  it('vereinfacht Buchstaben ohne Zerlegung wie unaccent', () => {
    expect(searchFold('Søren Æble Œuvre')).toBe('soren aeble oeuvre')
  })

  it('behandelt zerlegte Umlaute (NFD) wie zusammengesetzte', () => {
    expect(searchFold('Mu\u0308ller')).toBe('mueller')
  })

  it('macht Bindestriche und Satzzeichen zu Leerzeichen und zieht zusammen', () => {
    expect(searchFold('  Gebrüder Müller-Lüdenscheidt  GmbH & Co. KG ')).toBe(
      'gebrueder mueller luedenscheidt gmbh co kg'
    )
    expect(searchFold('RE-2026/0042')).toBe('re 2026 0042')
  })

  it('zerlegt die Anfrage in hoechstens sechs Woerter ab zwei Zeichen', () => {
    expect(searchTokens('Müller x Gebrüder')).toEqual(['mueller', 'gebrueder'])
    expect(searchTokens('a b c d e f g h i j k l m n o p q')).toEqual([])
    expect(searchTokens('aa bb cc dd ee ff gg')).toHaveLength(6)
    expect(searchTokens('mueller Müller')).toEqual(['mueller'])
  })

  it('verlangt jedes Wort, Reihenfolge egal', () => {
    const tokens = searchTokens('Mueller Gebrüder')
    expect(matchesAllTokens('Gebrüder Müller-Lüdenscheidt', tokens)).toBe(true)
    expect(matchesAllTokens('Müller AG', tokens)).toBe(false)
    expect(matchesAllTokens('irgendwas', [])).toBe(false)
  })
})

describe('highlightSegments', () => {
  it('markiert die Fundstelle im Originaltext, auch wenn erst die Faltung passt', () => {
    expect(marks('Gebrüder Müller-Lüdenscheidt', 'Mueller')).toEqual(['Müller'])
    expect(marks('Gebrüder Mueller', 'Müller')).toEqual(['Mueller'])
    expect(marks('Hauptstraße 5', 'strasse')).toEqual(['straße'])
  })

  it('setzt die Abschnitte wieder zum Originaltext zusammen', () => {
    const text = 'Gebrüder Müller-Lüdenscheidt GmbH'
    expect(highlightSegments(text, 'lüden gmbh').map((s) => s.text).join('')).toBe(text)
  })

  it('markiert mehrere Woerter und Teilstrings', () => {
    expect(marks('Gebrüder Müller-Lüdenscheidt', 'müller gebr')).toEqual(['Gebr', 'Müller'])
    expect(marks('Supportvertrag Supportvertrag', 'support')).toEqual(['Support', 'Support'])
  })

  it('markiert ein Umlaut-Zeichen ganz, auch wenn nur ein Teil passt', () => {
    // "lue" endet mitten in "ü" (=ue) - das ganze ü wird fett
    expect(marks('Lüdenscheidt', 'lu')).toEqual(['Lü'])
  })

  it('verbindet direkt aneinander liegende Fundstellen', () => {
    expect(marks('abcdef', 'abc cdef')).toEqual(['abcdef'])
  })

  it('markiert nichts ohne verwertbare Woerter', () => {
    expect(highlightSegments('Müller', 'x')).toEqual([{ text: 'Müller', match: false }])
    expect(highlightSegments('', 'mueller')).toEqual([])
    expect(marks('Müller', 'meier')).toEqual([])
  })

  it('kommt mit zerlegten Umlauten im Text zurecht', () => {
    expect(marks('Mu\u0308ller', 'mueller')).toEqual(['Mu\u0308ller'])
  })
})
