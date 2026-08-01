import React, { createContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EN, PATOIS, Translations } from '../constants/translations';

export type Language = 'en' | 'patois';

interface LanguageContextType {
  language: Language;
  t: Translations;
  setLanguage: (lang: Language) => Promise<void>;
  toggleLanguage: () => Promise<void>;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANG_KEY = '@vybzhub_language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLangState] = useState<Language>('en');

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY)
      .then((v) => { if (v === 'en' || v === 'patois') setLangState(v); })
      .catch(() => {});
  }, []);

  const setLanguage = async (lang: Language) => {
    setLangState(lang);
    try { await AsyncStorage.setItem(LANG_KEY, lang); } catch (_) {}
  };

  const toggleLanguage = async () => {
    await setLanguage(language === 'en' ? 'patois' : 'en');
  };

  return (
    <LanguageContext.Provider
      value={{ language, t: language === 'patois' ? PATOIS : EN, setLanguage, toggleLanguage }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
