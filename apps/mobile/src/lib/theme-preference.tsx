import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** `system` devolve o controle ao aparelho, inclusive ao agendamento por pôr do sol. */
export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'pref:theme';

const OPTIONS: ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(value: string | null): value is ThemePreference {
  return value != null && (OPTIONS as string[]).includes(value);
}

/**
 * Aplica a preferência no nível do React Native, e não só nos nossos estilos.
 *
 * `Appearance.setColorScheme` faz o `useColorScheme()` de todo o app passar a
 * devolver o valor escolhido — então mapa, alertas nativos e barra de status
 * acompanham junto. Fosse um contexto só nosso, o painel escureceria e o mapa do
 * MapKit continuaria claro, que é pior que não ter opção nenhuma.
 */
function applyPreference(preference: ThemePreference): void {
  // `'unspecified'` é o sentinela do RN 0.85 para "volte a seguir o aparelho" —
  // `null` é aceito pelo módulo nativo mas não pelo tipo, e devolver o controle
  // ao sistema é justamente o estado padrão desta tela.
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

type ThemePreferenceValue = {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};

const ThemePreferenceContext = createContext<ThemePreferenceValue | undefined>(undefined);

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  // A leitura do disco é assíncrona: até ela voltar, o app fica no modo do
  // sistema, que é o padrão e evita um piscar de tema na abertura.
  useEffect(() => {
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!isPreference(stored) || stored === 'system') return;
        setPreferenceState(stored);
        applyPreference(stored);
      })
      .catch(() => undefined);
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    applyPreference(next);
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreferenceValue {
  const ctx = useContext(ThemePreferenceContext);
  if (!ctx) {
    throw new Error('useThemePreference deve ser usado dentro de ThemePreferenceProvider');
  }
  return ctx;
}

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
};

export const THEME_PREFERENCE_OPTIONS = OPTIONS;
