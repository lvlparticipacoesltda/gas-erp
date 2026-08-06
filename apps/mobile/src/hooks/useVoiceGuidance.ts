import { useCallback, useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import {
  buildManeuverSpeech,
  isVoiceMuted,
  setVoiceMuted,
  speak,
  stopSpeaking,
  VOICE_TRIGGERS_M,
  type VoiceTrigger,
} from '../lib/voice-guidance';
import type { NextManeuver } from './useRouteProgress';

/**
 * Anuncia a manobra por voz e vibração.
 *
 * O entregador de moto não pode olhar a tela — sem áudio, a instrução visual só
 * é lida parando ou arriscando. Cada faixa de distância (300 m, 50 m) fala uma
 * única vez por manobra: a chave de controle combina instrução e faixa, então
 * uma nova manobra reabre os dois anúncios, e a mesma manobra não repete
 * enquanto o GPS atualiza.
 */
export function useVoiceGuidance({
  maneuver,
  arrived,
  enabled,
}: {
  maneuver: NextManeuver | null;
  arrived: boolean;
  enabled: boolean;
}) {
  const [muted, setMuted] = useState(false);
  const spokenRef = useRef<Set<string>>(new Set());
  const arrivalSpokenRef = useRef(false);

  useEffect(() => {
    void isVoiceMuted().then(setMuted);
  }, []);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      void setVoiceMuted(next);
      if (next) stopSpeaking();
      return next;
    });
  }, []);

  // Fora de navegação a memória de anúncios é zerada: ao retomar a rota, o
  // entregador precisa ouvir a manobra atual de novo.
  useEffect(() => {
    if (enabled) return;
    spokenRef.current.clear();
    arrivalSpokenRef.current = false;
    stopSpeaking();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || muted || !maneuver) return;

    // A faixa aplicável é a **menor** que ainda comporta a distância: a 40 m do
    // cruzamento vale o aviso de 50 m, não o de 300 m. Percorrer o array direto
    // (300, 50) devolveria sempre 300 e o aviso final nunca sairia.
    const trigger = [...VOICE_TRIGGERS_M]
      .reverse()
      .find((t: VoiceTrigger) => maneuver.distanceMeters <= t);
    if (trigger == null) return;

    // A chave inclui o índice do passo porque instrução se repete numa mesma
    // rota ("Vire à direita" duas vezes) — sem isso, a segunda ocorrência
    // ficaria muda por já constar como anunciada.
    const key = `${maneuver.stepIndex}:${maneuver.instruction}@${trigger}`;
    if (spokenRef.current.has(key)) return;
    spokenRef.current.add(key);

    speak(buildManeuverSpeech(maneuver.instruction, trigger));
    // A manobra iminente vibra: com capacete, é o canal que sobra.
    if (trigger === 50) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [enabled, muted, maneuver?.instruction, maneuver?.distanceMeters]);

  useEffect(() => {
    if (!enabled || !arrived || arrivalSpokenRef.current) return;
    arrivalSpokenRef.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!muted) speak('Você chegou ao destino');
  }, [enabled, arrived, muted]);

  return { muted, toggleMuted };
}
