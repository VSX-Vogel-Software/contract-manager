import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import de from '../locales/de.json'
import en from '../locales/en.json'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      de: { translation: de },
      en: { translation: en },
    },
    fallbackLng: 'de',
    interpolation: {
      escapeValue: false,
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
