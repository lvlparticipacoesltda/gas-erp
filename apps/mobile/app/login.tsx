import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInput as TextInputType,
} from 'react-native';
import { Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Loading } from '@/components/ui';
import { BrandLogo } from '@/components/BrandLogo';
import { useAuth } from '@/lib/auth';
import { makeStyles, radius, spacing, useColors } from '@/theme';

export default function LoginScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { login, token, initializing, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const passwordRef = useRef<TextInputType>(null);
  const pairingRef = useRef<TextInputType>(null);

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

  function scrollFieldIntoView(yOffset: number) {
    // Pequeno atraso para o teclado abrir antes de rolar.
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, yOffset), animated: true });
    }, 120);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brand}>
            <BrandLogo />
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
              textContentType="emailAddress"
              autoComplete="email"
              returnKeyType="next"
              editable={!submitting}
              onFocus={() => scrollFieldIntoView(40)}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />

            <Text style={styles.label}>Senha</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry={!showPassword}
                textContentType="password"
                autoComplete="password"
                returnKeyType="next"
                editable={!submitting}
                onFocus={() => scrollFieldIntoView(120)}
                onSubmitEditing={() => pairingRef.current?.focus()}
              />
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={colors.textMuted}
                />
              </Pressable>
            </View>

            <Text style={styles.label}>Código do aparelho (atendente)</Text>
            <TextInput
              ref={pairingRef}
              style={styles.input}
              value={pairingCode}
              onChangeText={setPairingCode}
              placeholder="Opcional — gerado em Minha conta"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              editable={!submitting}
              onFocus={() => scrollFieldIntoView(220)}
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

const useStyles = makeStyles((colors) => ({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  center: { flex: 1, backgroundColor: colors.surface, justifyContent: 'center' },
  scroll: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl * 2,
    gap: spacing.xl,
  },
  brand: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.lg },
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
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  eyeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  pairingHint: { fontSize: 12, color: colors.textFaint, marginTop: 4, lineHeight: 16 },
  error: { color: colors.dangerText, fontSize: 13, marginTop: spacing.sm },
  submit: { marginTop: spacing.lg },
}));
