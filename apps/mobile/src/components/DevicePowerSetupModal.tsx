import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getAutostartGuide,
  needsAutostartGuide,
  openAutostartSettings,
  openBatteryOptimizationSettings,
  type AutostartGuide,
} from '@/lib/device-power-guides';
import {
  markAutostartSetupComplete,
  markBatterySetupComplete,
  shouldShowDevicePowerSetup,
} from '@/lib/device-power-setup';
import { Button } from '@/components/ui';
import { colors, radius, spacing } from '@/theme';

type Step = 'battery' | 'autostart';

export function DevicePowerSetupModal({
  visible,
  onCompleted,
}: {
  visible: boolean;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<Step>('battery');
  const autostartGuide = useMemo<AutostartGuide | null>(
    () => (needsAutostartGuide() ? getAutostartGuide() : null),
    [],
  );

  useEffect(() => {
    if (visible) setStep('battery');
  }, [visible]);

  const finish = useCallback(() => {
    onCompleted();
  }, [onCompleted]);

  const completeBatteryStep = useCallback(async () => {
    await markBatterySetupComplete();
    if (autostartGuide) {
      setStep('autostart');
      return;
    }
    finish();
  }, [autostartGuide, finish]);

  const completeAutostartStep = useCallback(async () => {
    await markAutostartSetupComplete();
    finish();
  }, [finish]);

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={() => undefined}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {step === 'battery' ? (
              <>
                <Text style={styles.kicker}>Configuração do celular</Text>
                <Text style={styles.title}>Deixe o rastreamento sempre ativo</Text>
                <Text style={styles.body}>
                  Para a loja ver você no mapa com o app minimizado, o Android precisa permitir que
                  este app rode sem economia de bateria.
                </Text>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Passo 1 — Bateria</Text>
                  <Text style={styles.cardBody}>
                    Toque em abrir configurações, encontre Gás do Povo Entregador e escolha{' '}
                    <Text style={styles.strong}>Sem restrições</Text> ou{' '}
                    <Text style={styles.strong}>Não otimizar</Text>.
                  </Text>
                </View>
                <Button
                  label="Abrir configurações de bateria"
                  onPress={() => {
                    void openBatteryOptimizationSettings().catch(() => undefined);
                  }}
                />
                <Button
                  label="Já configurei — continuar"
                  variant="secondary"
                  onPress={() => {
                    void completeBatteryStep();
                  }}
                  style={styles.secondaryButton}
                />
              </>
            ) : (
              autostartGuide && (
                <>
                  <Text style={styles.kicker}>Configuração do celular</Text>
                  <Text style={styles.title}>{autostartGuide.title}</Text>
                  <Text style={styles.body}>
                    Em aparelhos {autostartGuide.variant === 'xiaomi' ? 'Xiaomi' : 'desta marca'}, só
                    liberar a bateria não basta: é preciso permitir que o app{' '}
                    <Text style={styles.strong}>inicie automaticamente</Text> após reiniciar ou
                    fechar.
                  </Text>
                  <View style={styles.card}>
                    <Text style={styles.cardTitle}>Passo 2 — Início automático</Text>
                    {autostartGuide.steps.map((line, index) => (
                      <Text key={line} style={styles.stepLine}>
                        {index + 1}. {line}
                      </Text>
                    ))}
                  </View>
                  <Button
                    label="Abrir configurações de início automático"
                    onPress={() => {
                      void openAutostartSettings(autostartGuide).catch(() => undefined);
                    }}
                  />
                  <Button
                    label="Já configurei — concluir"
                    variant="secondary"
                    onPress={() => {
                      void completeAutostartStep();
                    }}
                    style={styles.secondaryButton}
                  />
                </>
              )
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(28, 20, 12, 0.45)',
  },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  kicker: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  body: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
  },
  strong: {
    color: colors.text,
    fontWeight: '700',
  },
  card: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  cardBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  stepLine: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  secondaryButton: {
    marginTop: spacing.xs,
  },
});
