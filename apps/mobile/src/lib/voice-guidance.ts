import * as SecureStore from 'expo-secure-store';
import * as Speech from 'expo-speech';

const MUTE_KEY = 'voice_guidance_muted';

/**
 * Faixas de antecipação, em metros. A manobra é anunciada uma vez por faixa:
 * a primeira dá tempo de mudar de faixa de rolamento, a segunda confirma na hora
 * de virar. Anunciar a cada atualização de GPS viraria metralhadora.
 */
export const VOICE_TRIGGERS_M = [300, 50] as const;

export type VoiceTrigger = (typeof VOICE_TRIGGERS_M)[number];

export async function isVoiceMuted(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(MUTE_KEY).catch(() => null);
  return value === '1';
}

export async function setVoiceMuted(muted: boolean): Promise<void> {
  await SecureStore.setItemAsync(MUTE_KEY, muted ? '1' : '0').catch(() => undefined);
}

/**
 * Fala em pt-BR. `Speech.stop()` antes evita duas instruções sobrepostas quando
 * a manobra muda enquanto a anterior ainda está sendo lida — em movimento, ouvir
 * duas ruas ao mesmo tempo é pior que não ouvir nada.
 */
export function speak(text: string): void {
  if (!text.trim()) return;
  Speech.stop();
  Speech.speak(text, { language: 'pt-BR', rate: 1.0, pitch: 1.0 });
}

export function stopSpeaking(): void {
  Speech.stop();
}

/** "Em 300 metros, vire à direita na Rua X" / "Vire à direita na Rua X". */
export function buildManeuverSpeech(instruction: string, trigger: VoiceTrigger): string {
  const clean = instruction.trim().replace(/\s+/g, ' ');
  if (!clean) return '';
  if (trigger >= 1000) {
    const km = (trigger / 1000).toFixed(1).replace('.', ',');
    return `Em ${km} quilômetros, ${lowerFirst(clean)}`;
  }
  if (trigger > 100) return `Em ${trigger} metros, ${lowerFirst(clean)}`;
  return clean;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase('pt-BR') + text.slice(1);
}
