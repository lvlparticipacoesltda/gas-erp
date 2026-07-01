# Checklist de publicação — App Gas Entregador (Google Play)

Guia prático para publicar o app de entregadores na Play Store. O ponto mais sensível é
a **permissão de localização em segundo plano** (`ACCESS_BACKGROUND_LOCATION`), que o
Google revisa manualmente.

Comandos de dev/emulador/EAS: [development.md](development.md) · Push FCM: [mobile-push-fcm.md](mobile-push-fcm.md)

## 1. Pré-requisitos do projeto (já implementados)

- [x] `android.package` definido (`com.gaserp.entregador`) em `apps/mobile/app.json`.
- [x] Permissões declaradas: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
      `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`.
- [x] Foreground service com notificação persistente durante a rota.
- [x] **Divulgação destacada (prominent disclosure)** exibida no app antes de solicitar
      a permissão de background (tela de detalhe da entrega, ao iniciar a rota).
- [x] Coleta de localização **somente durante rota ativa**; encerra ao concluir/logout.
- [x] Perfis de build EAS em `apps/mobile/eas.json`.
- [x] Push via Expo + FCM (`google-services.json` via EAS secret) — ver [mobile-push-fcm.md](mobile-push-fcm.md).

## 2. Divulgação destacada — requisito obrigatório

O Google exige que, **antes** do prompt do sistema, o app mostre um aviso que:

- identifique que dados são coletados (localização);
- diga que a coleta ocorre **em segundo plano / com o app fechado**;
- explique a finalidade (compartilhar o trajeto da entrega com a loja);
- exija ação afirmativa do usuário (botão "Permitir").

Isso já está implementado em `confirmLocationDisclosure()` em
`apps/mobile/app/delivery/[id].tsx`. **Grave um vídeo** demonstrando esse fluxo — o
Google costuma pedir no formulário de declaração de permissão.

## 3. Formulário de declaração de permissões (Play Console)

Ao subir o app, em **Política → Permissões de apps → Localização em segundo plano**:

- [ ] Justificativa: "O recurso principal de rastreamento de entregas exige a localização
      em segundo plano para acompanhar o trajeto do entregador até o cliente enquanto o
      app está minimizado."
- [ ] Anexar vídeo mostrando: (1) a divulgação destacada, (2) o prompt do sistema,
      (3) o uso do recurso.
- [ ] Confirmar que a coleta ocorre só com rota ativa.

## 4. Segurança de dados (Data safety form)

| Campo | Resposta |
|-------|----------|
| Coleta localização aproximada? | Sim |
| Coleta localização precisa? | Sim |
| Localização é compartilhada com terceiros? | Não (apenas o servidor da distribuidora) |
| Localização é obrigatória? | Sim, para o recurso de rota |
| Dados são criptografados em trânsito? | Sim (HTTPS) |
| Usuário pode solicitar exclusão dos dados? | Sim |
| Dados pessoais coletados | Nome, e-mail, telefone, localização |

## 5. Ficha da loja

- [ ] **URL da Política de Privacidade** (publicar `docs/privacy-policy.md` em uma URL
      pública, ex.: página no site da distribuidora).
- [ ] Categoria: Negócios / Produtividade.
- [ ] Público-alvo: adultos (uso profissional). Não direcionado a crianças.
- [ ] Capturas de tela, ícone (512×512) e feature graphic.
- [ ] **URL de exclusão de conta** (exigida pelo Google): página explicando como o
      entregador exclui a conta/dados (ver seção 5 da política de privacidade).

## 6. Build e envio

```bash
cd apps/mobile
npx eas login
npx eas build -p android --profile production   # gera o App Bundle (.aab)
npx eas submit -p android --latest              # envia para o Play Console
```

> O app é **multi-tenant**: um único pacote atende todas as distribuidoras. Empresas
> novas não exigem novo app — basta cadastrar a organização, as unidades e os usuários
> entregadores no painel. O login define a empresa/unidade do entregador.

## 7. Observações

- GPS em background **não funciona no Expo Go** — teste com dev build local (`expo run:android` + `expo start --dev-client`) ou APK EAS (`preview`/`development`).
- Releases de teste interno na Play Store ajudam a validar a permissão antes da produção.
