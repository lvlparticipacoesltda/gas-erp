import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Loading } from '@/components/ui';
import { BrandLogo } from '@/components/BrandLogo';
import { useAuth } from '@/lib/auth';
import { colors, radius, spacing } from '@/theme';

export default function LoginScreen() {
  const { login, token, initializing, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (initializing) {
    return (
      <View style={styles.center}>
        <Loading />
      </View>
    );
  }
  if (token) {
    if (user?.role === 'ATTENDANT') return <Redirect href="/schedule" />;
    return <Redirect href="/" />;
  }

  async function onSubmit() {
    if (!email || !password) {
      setError('Informe e-mail e senha.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password, pairingCode || undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <BrandLogo />
            <Text style={styles.hint}>
              Entregadores: entregas e ponto. Atendentes: escala e ponto.
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>E-mail</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="seu@email.com"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              editable={!submitting}
            />

            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textFaint}
              secureTextEntry
              editable={!submitting}
            />

            <Text style={styles.label}>Código do aparelho (atendente)</Text>
            <TextInput
              style={styles.input}
              value={pairingCode}
              onChangeText={setPairingCode}
              placeholder="Opcional — gerado em Minha conta"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!submitting}
              onSubmitEditing={onSubmit}
            />
            <Text style={styles.pairingHint}>
              Atendente: use o código em Minha conta → Dispositivos confiáveis para não
              desconectar o painel web.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Button
              label="Entrar"
              onPress={onSubmit}
              loading={submitting}
              style={styles.submit}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.xxl },
  brand: { alignItems: 'center', gap: spacing.sm },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  pairingHint: { fontSize: 12, color: colors.textFaint, marginTop: 4, lineHeight: 16 },
  error: { color: colors.dangerText, fontSize: 13, marginTop: spacing.sm },
  submit: { marginTop: spacing.lg },
});
