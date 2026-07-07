import { useCallback, useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui';
import {
  registerLocationDisclosurePresenter,
  type LocationDisclosureKind,
} from '@/lib/location-disclosure';
import { colors, radius, spacing } from '@/theme';

const COPY: Record<
  LocationDisclosureKind,
  { title: string; body: string; accept: string; decline: string; footnote?: string }
> = {
  foreground: {
    title: 'Uso da sua localização',
    body:
      'O aplicativo Gás do Povo Entregador coleta e usa sua localização precisa (GPS) para:\n\n'
      + '• Mostrar sua posição no mapa da loja quando você está disponível\n'
      + '• Exibir sua localização no mapa durante rotas ativas\n'
      + '• Registrar o trajeto das entregas concluídas\n\n'
      + 'Esses dados são enviados de forma segura aos servidores da sua loja.',
    footnote:
      'Na próxima tela, o Android pedirá permissão de localização. Toque em Aceitar somente se concordar com esse uso.',
    accept: 'Aceitar',
    decline: 'Recusar',
  },
  background: {
    title: 'Localização em segundo plano',
    body:
      'Para manter sua posição atualizada no mapa da loja com o app fechado ou em segundo plano, '
      + 'o aplicativo precisa continuar coletando sua localização GPS.\n\n'
      + 'Isso ocorre enquanto você estiver disponível ou em rota de entrega. O compartilhamento '
      + 'é interrompido quando a loja marcar você como indisponível ou você concluir a entrega.',
    footnote:
      'Na próxima tela, selecione "Permitir o tempo todo" (ou equivalente) para manter o rastreamento.',
    accept: 'Aceitar',
    decline: 'Recusar',
  },
};

type PendingRequest = {
  kind: LocationDisclosureKind;
  resolve: (accepted: boolean) => void;
};

/** Modal de divulgação destacada (Google Play) — sempre antes do prompt do sistema. */
export function LocationDisclosureHost() {
  const [queue, setQueue] = useState<PendingRequest[]>([]);
  const current = queue[0] ?? null;

  const enqueue = useCallback((request: PendingRequest) => {
    setQueue((prev) => [...prev, request]);
  }, []);

  useEffect(() => {
    registerLocationDisclosurePresenter(enqueue);
    return () => registerLocationDisclosurePresenter(null);
  }, [enqueue]);

  const respond = useCallback((accepted: boolean) => {
    setQueue((prev) => {
      const [head, ...rest] = prev;
      head?.resolve(accepted);
      return rest;
    });
  }, []);

  if (!current) return null;

  const copy = COPY[current.kind];

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => respond(false)}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.body}>{copy.body}</Text>
            {copy.footnote ? <Text style={styles.footnote}>{copy.footnote}</Text> : null}
            <View style={styles.actions}>
              <Button
                label={copy.decline}
                variant="secondary"
                onPress={() => respond(false)}
                style={styles.actionButton}
              />
              <Button
                label={copy.accept}
                onPress={() => respond(true)}
                style={styles.actionButton}
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(28, 20, 12, 0.55)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
  },
  footnote: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textFaint,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
