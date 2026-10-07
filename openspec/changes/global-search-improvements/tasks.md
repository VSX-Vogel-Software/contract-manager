## 1. Backend

- [x] 1.1 Migration: `CREATE EXTENSION IF NOT EXISTS unaccent`, IMMUTABLE-Funktion `cm_fold(text)`
- [x] 1.2 `fold()` in Python, gleiche Ergebnisse wie `cm_fold` (Test gegen die DB)
- [x] 1.3 Suchmodul: Tokens, Felder je Bereich, Ranking, unscharfer Fallback, Betragssuche
- [x] 1.4 Neue Gruppen Angebote, Produkte, Eingangsrechnungen, Gegenparteien - je mit Leserecht
- [x] 1.5 Zusaetzliche Felder Kunden (E-Mail, USt-ID), Vertraege (Kunde, Nummern), Rechnungen (Kunde)
- [x] 1.6 GraphQL `types`, `offset`; Gruppen nach bestem Rang
- [x] 1.7 pytest: Testmatrix der Bewertung (39 Anfragen) als Regressionstest, Rechte je neuer Gruppe, Query-Anzahl, Laufzeit

## 2. Frontend

- [x] 2.1 Faltung in TypeScript, Hervorhebung, Symbole je Bereich, veraltete Treffer abgeblendet
- [x] 2.2 Ergebnisseite `/search` mit Nachladen je Bereich, mobil als Karten
- [x] 2.3 Enter ohne Auswahl und "weitere Ergebnisse" -> Ergebnisseite
- [x] 2.4 Seitensuche mit Faltung, fehlende Seiten
- [x] 2.5 Vitest, Mobil-E2E (Suche, Ergebnisseite in 7 Formaten)

## 3. Abschluss

- [ ] 3.1 Volle Suiten gruen, Testmatrix erneut messen
- [ ] 3.2 Changelog, Release, Spec nach `openspec/specs/global-search/`, Change ins Archiv
