import i18n, { type BackendModule, type ResourceKey } from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// Sprachdateien als eigene Chunks: geladen wird nur die aktive Sprache
// (plus die Rueckfallsprache de, falls die aktive eine andere ist). Ein
// Sprachwechsel laedt die neue Datei nach, bevor umgeschaltet wird -
// changeLanguage wartet darauf, es blitzen also keine Schluessel auf.
const locales: Record<string, () => Promise<{ default: ResourceKey }>> = {
  de: () => import('../locales/de.json'),
  en: () => import('../locales/en.json'),
}

const lazyLocaleBackend: BackendModule = {
  type: 'backend',
  init() {},
  read(language, _namespace, callback) {
    const load = locales[language]
    // Unbekannte Sprache: leer, die Rueckfallsprache uebernimmt
    if (!load) return callback(null, {})
    load().then(
      (m) => callback(null, m.default),
      (err) => callback(err, null)
    )
  },
}

/**
 * Erfuellt sich, sobald die Startsprache geladen ist. main.tsx rendert erst
 * danach - sonst zeigt der erste Render Schluessel statt Text.
 */
export const i18nReady = i18n
  .use(lazyLocaleBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'de',
    // "en-US" -> nur "en" laden
    load: 'languageOnly',
    interpolation: {
      escapeValue: false,
    },
    react: {
      // Wir warten selbst auf i18nReady; kein Suspense in useTranslation
      useSuspense: false,
    },
  })

// <html lang> folgt der UI-Sprache - Screenreader und die Silbentrennung
// (hyphens: auto, z. B. in fixierten Tabellenspalten) richten sich danach
const syncDocumentLang = (lng?: string) => {
  if (lng) document.documentElement.lang = lng.split('-')[0]
}
syncDocumentLang(i18n.resolvedLanguage ?? i18n.language)
i18n.on('languageChanged', syncDocumentLang)

export default i18n
