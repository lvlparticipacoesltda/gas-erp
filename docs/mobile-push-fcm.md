# Push notifications — app entregador (Android)

Permissão de notificação no celular **não basta**. Em builds EAS/APK, o Expo só gera `ExponentPushToken[...]` se o **Firebase Cloud Messaging (FCM)** estiver configurado.

Sem FCM, o app aceita a permissão mas **nunca grava token no banco** — nos logs da Railway aparece:

```text
Push NEW_DELIVERY ignorado: entregador ... sem expoPushToken registrado
```

E **não** aparece `Push token registrado para entregador ...`.

---

## Checklist (obrigatório para APK)

| Passo | Onde |
|-------|------|
| 1. Projeto Firebase | [console.firebase.google.com](https://console.firebase.google.com) |
| 2. App Android `com.gaserp.entregador` | Firebase → Adicionar app |
| 3. Baixar `google-services.json` | Colocar **localmente** em `apps/mobile/google-services.json` (não commitar) |
| 4. Referenciar no `app.json` | `"googleServicesFile": "./google-services.json"` |
| 5. Secret no EAS (builds na nuvem) | Ver seção **EAS — google-services.json** abaixo |
| 6. Chave FCM V1 (Service Account JSON) | Firebase → Project settings → Service accounts → Generate key |
| 7. Enviar chave ao EAS | `eas credentials` → Android → FCM V1 |
| 8. **Novo build** | `eas build -p android --profile preview` |

> **Não commite** `google-services.json` — contém API key do Google. Use `google-services.json.example` como modelo. Restrinja a key no [Google Cloud Console](https://console.cloud.google.com/apis/credentials) (app Android + package `com.gaserp.entregador`).

---

## 1. Firebase

1. Crie ou use um projeto Firebase (ex.: `gas-erp-entregador`).
2. Adicione app **Android** com package name: **`com.gaserp.entregador`** (igual ao `app.json`).
3. Baixe **`google-services.json`** e salve em:

   ```text
   apps/mobile/google-services.json
   ```

   Ou copie o exemplo e preencha:

   ```bash
   cp apps/mobile/google-services.json.example apps/mobile/google-services.json
   ```

---

## EAS — google-services.json (só se usar `eas build` na nuvem)

O arquivo **não está no Git** (`.gitignore`). Isso **não exige trocar a API key** — é só para o repositório público não expor o JSON.

| Como você builda | Precisa de secret no EAS? |
|------------------|---------------------------|
| `eas build` (servidor Expo clona o GitHub) | **Sim** — o clone não traz `google-services.json` |
| `expo run:android` no seu Mac | **Não** — usa o arquivo local em `apps/mobile/` |
| APK já instalado no celular | **Não** — nada muda |

Se um dia rodar `eas build` sem o secret, o build falha por falta do `google-services.json`. Até lá, pode ignorar esta seção.

```bash
cd apps/mobile
npx eas env:create \
  --name GOOGLE_SERVICES_JSON_BASE64 \
  --value "$(base64 -i google-services.json | tr -d '\n')" \
  --environment preview \
  --visibility secret
```

Repita para `production` se usar esse perfil. O `app.config.js` recria o arquivo a partir do secret no build.

---

## 2. app.json

Em `apps/mobile/app.json`, dentro de `expo.android`:

```json
"android": {
  "package": "com.gaserp.entregador",
  "googleServicesFile": "./google-services.json",
  ...
}
```

---

## 3. Credenciais FCM no EAS

No terminal, na pasta do app:

```bash
cd apps/mobile
npx eas login
npx eas credentials
```

- **Android** → perfil **preview** (e depois **production**)
- **Google Service Account** → **FCM V1**
- **Upload** do JSON da service account (Firebase → Project settings → Service accounts → Generate new private key)

Repita para o perfil `production` se for publicar na Play Store.

Documentação oficial: [FCM credentials (Expo)](https://docs.expo.dev/push-notifications/fcm-credentials/)

---

## 4. Novo build

```bash
cd apps/mobile
npx eas build -p android --profile preview
```

Instale o APK novo no celular (desinstale a versão anterior se necessário).

---

## 5. Validar

1. Abra o app → aceite **notificações**
2. Faça **login** como entregador
3. Logs Railway (API):
   - ✅ `Push token registrado para entregador ...`
4. Atribua uma entrega na loja:
   - ✅ `Push NEW_DELIVERY enviado para entregador ...`

### Debug no celular (adb)

Com o app aberto após login:

```bash
adb logcat | grep -i '\[push\]'
```

Mensagens úteis:

| Log | Significado |
|-----|-------------|
| `[push] token registrado na API` | OK |
| `[push] falha ao obter Expo Push Token: ... Firebase ...` | Falta FCM / `google-services.json` |
| `[push] permissão de notificação não concedida` | Usuário negou notificações |
| `[push] erro ao enviar token à API: ...` | JWT ou validação na API |

---

## Som customizado de rota

O app usa `assets/sounds/rota_entrega.wav` para **nova rota** e **lembrete de aceite**. Cancelamentos usam o som padrão do sistema.

- Canal Android (rota): `deliveries-route`
- Canal Android (cancelamento): `deliveries`
- Alterar o som exige **novo build APK** (`eas build`), não basta OTA
- Quem já tinha o app instalado pode precisar reinstalar para o Android aplicar o novo canal/som

---

## Resumo

| Sintoma | Causa provável |
|---------|----------------|
| Permissão OK, sem token no banco | **FCM não configurado** no EAS + rebuild |
| `Push token registrado` nos logs | Token OK — push de entrega deve funcionar |
| Token inválido nos logs da API | Formato errado (raro com Expo) |
