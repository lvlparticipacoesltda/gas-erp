import { StyleSheet, useColorScheme } from 'react-native';

/**
 * Paleta Gás do Povo — app do entregador.
 *
 * Duas paletas, não uma. A tela é lida sob sol direto, em movimento, e boa parte
 * da entrega de GLP acontece à noite: mapa e painel claros no escuro ofuscam e
 * destroem a visão adaptada, o que é problema de segurança, não de gosto.
 *
 * Os valores de texto foram escolhidos por contraste medido (WCAG AA, 4.5:1),
 * não por aparência. Dois casos que parecem estranhos e são deliberados:
 *
 * - `primaryText` é **escuro** sobre o laranja da marca. Branco sobre `#FB5E13`
 *   dá 3,13:1 e reprova; o coal da marca sobre o mesmo laranja dá 5,81:1. Assim
 *   o laranja continua exatamente o da marca e só o rótulo muda.
 * - `primaryDark` existe para texto pequeno (ETA, distância, links). O laranja
 *   vivo segue como fundo de área grande, onde 3:1 basta por ser componente não
 *   textual.
 */
export type Colors = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primaryMuted: string;
  primaryText: string;
  navy: string;
  /** Rótulo sobre o navy — inverte com o tema, como `successOn`. */
  navyOn: string;
  sand: string;
  success: string;
  /** Rótulo sobre o verde de sucesso — inverte com o tema, senão some. */
  successOn: string;
  successBg: string;
  successText: string;
  warning: string;
  warningBg: string;
  warningText: string;
  danger: string;
  dangerBg: string;
  dangerText: string;
  info: string;
  infoBg: string;
  infoText: string;
  /** Fundo do FAB de lista — amarelo de alta visibilidade sob sol. */
  fab: string;
  /** Véu de carregamento sobre o mapa. */
  overlay: string;
};

export const lightColors: Colors = {
  bg: '#F4EEE8',
  surface: '#FFFFFF',
  surfaceAlt: '#FBF7F3',
  border: '#E8DFD6',
  text: '#1C140C',
  textMuted: '#6B5F56',
  // Era #9A8F86 (3,16:1) — reprovava para texto pequeno.
  textFaint: '#7A6E64',
  primary: '#FB5E13',
  // Era #E84B0B (3,86:1) — insuficiente para texto pequeno.
  primaryDark: '#C2410C',
  primaryLight: '#FF8A2B',
  primaryMuted: '#FFF4ED',
  primaryText: '#1C140C',
  navy: '#1C140C',
  navyOn: '#FFFFFF',
  sand: '#F4EEE8',
  // Era #16A34A (3,30:1 com branco).
  success: '#15803D',
  successOn: '#FFFFFF',
  successBg: '#DCFCE7',
  successText: '#166534',
  warning: '#B45309',
  warningBg: '#FFEDD5',
  warningText: '#9A3412',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  dangerText: '#991B1B',
  info: '#C2410C',
  infoBg: '#FFF4ED',
  infoText: '#9A3412',
  fab: '#FACC15',
  overlay: 'rgba(244, 238, 232, 0.6)',
};

export const darkColors: Colors = {
  // Neutros quentes, na mesma família do coal da marca — cinza puro ao lado do
  // laranja puxa para o esverdeado.
  bg: '#12100E',
  surface: '#1E1B18',
  surfaceAlt: '#272320',
  border: '#3A332C',
  text: '#F5EFE9',
  textMuted: '#B5A99E',
  textFaint: '#948A80',
  // O laranja vivo satura demais no escuro; o claro da marca sustenta melhor.
  primary: '#FF8A2B',
  primaryDark: '#FF8A2B',
  primaryLight: '#FFA45C',
  primaryMuted: '#2E211A',
  primaryText: '#1C140C',
  // No escuro o navy inverte: o chip selecionado vira pastilha clara.
  navy: '#F5EFE9',
  navyOn: '#12100E',
  sand: '#12100E',
  success: '#4ADE80',
  // Branco sobre este verde dá 1,74:1 — ilegível. Escuro dá 9,78:1.
  successOn: '#0B2015',
  successBg: '#14331F',
  successText: '#86EFAC',
  warning: '#FBBF24',
  warningBg: '#33280E',
  warningText: '#FCD34D',
  danger: '#F87171',
  dangerBg: '#3B1A1A',
  dangerText: '#FCA5A5',
  info: '#FF8A2B',
  infoBg: '#2E211A',
  infoText: '#FFC59B',
  fab: '#FACC15',
  overlay: 'rgba(18, 16, 14, 0.65)',
};

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}

const INK_DARK = '#1C140C';
const INK_LIGHT = '#FFFFFF';

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * Escolhe o rótulo legível sobre um fundo variável, por luminância.
 *
 * Serve onde a cor de fundo é decidida em tempo de execução — a célula do
 * calendário, por exemplo, pinta verde, âmbar, laranja ou cinza conforme o tipo
 * do dia. Nenhuma cor fixa resolve os quatro: no tema claro o branco ganha em
 * três e perde no laranja (3,13:1), e no escuro o texto escuro ganha em todos.
 * Medir é mais barato que manter uma tabela de exceções.
 */
export function readableOn(background: string): string {
  const bg = relativeLuminance(background);
  const contrast = (fg: number) =>
    (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
  return contrast(relativeLuminance(INK_DARK)) >= contrast(relativeLuminance(INK_LIGHT))
    ? INK_DARK
    : INK_LIGHT;
}

/**
 * Fábrica de estilos por tema.
 *
 * `StyleSheet.create` roda em escopo de módulo e por isso não reage a tema. Aqui
 * a folha é criada sob demanda e memoizada por esquema — no máximo duas por
 * componente durante toda a vida do app —, preservando a performance do
 * `StyleSheet` sem espalhar objeto de estilo inline pelo render.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: Colors) => T,
): () => T {
  let light: T | null = null;
  let dark: T | null = null;

  return function useStyles(): T {
    const isDark = useColorScheme() === 'dark';
    if (isDark) {
      if (!dark) dark = StyleSheet.create(factory(darkColors));
      return dark;
    }
    if (!light) light = StyleSheet.create(factory(lightColors));
    return light;
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;
