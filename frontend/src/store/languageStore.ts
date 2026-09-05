import { create } from 'zustand'
import { readStorage, writeStorage } from '@/utils/storage'
import { translations, type Language, type TranslationKey } from '@/i18n/translations'

const LANGUAGE_KEY = 'superpos_language'

interface LanguageState {
  language: Language
  setLanguage: (lang: Language) => void
}

export const useLanguageStore = create<LanguageState>((set) => ({
  language: readStorage<Language>(LANGUAGE_KEY, 'en'),
  setLanguage: (lang) => {
    writeStorage(LANGUAGE_KEY, lang)
    set({ language: lang })
  },
}))

/**
 * Translation hook. Usage: const t = useTranslation(); t('nav_dashboard')
 * Falls back to the English string (then the raw key) if a translation is
 * missing, so a partially-translated key never renders blank.
 */
export function useTranslation() {
  const language = useLanguageStore((s) => s.language)
  return (key: TranslationKey): string => {
    return translations[language]?.[key] ?? translations.en[key] ?? key
  }
}
