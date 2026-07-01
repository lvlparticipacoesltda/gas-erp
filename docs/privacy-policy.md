# Política de Privacidade — App Gás do Povo Entregador

_Última atualização: 30/06/2026_

**URL pública (Play Store):** https://thlgasdopovo.com.br/privacidade-entregador

**URL exclusão de conta:** https://thlgasdopovo.com.br/exclusao-conta-entregador

---

Esta política descreve como o aplicativo **Gás do Povo Entregador** (o "App") coleta, usa e
protege os dados dos entregadores que o utilizam. O App é uma ferramenta de uso
profissional, disponibilizada pelas distribuidoras de GLP (gás) às suas equipes de
entrega.

- **Controlador dos dados:** THL Gás do Povo — Rede Gás Litoral
- **Contato:** contato@thlgasdopovo.com.br
- **Site:** https://thlgasdopovo.com.br

O texto canônico para a web está em `apps/web/src/content/privacy-policy-entregador.ts` e é
renderizado em `/privacidade-entregador`.

## 1. Quais dados coletamos

| Dado | Finalidade | Quando |
|------|------------|--------|
| Nome, e-mail e telefone | Identificação e autenticação do entregador | No login / cadastro pela distribuidora |
| **Localização precisa (GPS)** | Mapa da loja e acompanhamento de entregas | Disponível e/ou com rota ativa |
| Dados das entregas (cliente, endereço, itens) | Realizar e registrar entregas | Enquanto há entregas atribuídas |
| Vendas pelo app (produto, pagamentos) | Registrar pedidos do entregador | Quando o recurso estiver habilitado |
| Token de notificação push (Expo/FCM) | Novas entregas, lembretes e cancelamentos | Após conceder permissão |
| Nível de bateria (opcional) | Disponibilidade operacional do dispositivo | Durante uso do App |

## 2. Notificações push

O App pode enviar notificações para avisar o entregador sobre **novas entregas
atribuídas**, **lembretes** ou **cancelamentos**. O token é registrado no servidor da
distribuidora após o login e removido no logout. As notificações não são usadas para
publicidade.

## 3. Localização e mapa

- **Presença no mapa:** quando o entregador está disponível, a posição pode ser
  atualizada para exibição no mapa operacional da loja.
- **Rota ativa:** ao iniciar uma rota, a localização é coletada em primeiro e segundo
  plano (com notificação persistente no Android) até concluir a entrega ou fazer logout.
- **Divulgação destacada:** antes do prompt de background, o App exibe aviso explicando o
  uso da localização; a coleta só ocorre após consentimento.

A localização **não** é coletada quando o entregador está indisponível e sem rota ativa.

## 4. Como usamos e compartilhamos

Os dados são enviados ao servidor da distribuidora à qual o entregador está vinculado e
ficam visíveis apenas para a equipe autorizada. **Não vendemos** dados pessoais nem os
usamos para publicidade. Cada organização tem seus dados isolados.

## 5. Retenção

Dados mantidos pelo período necessário à operação, auditoria e obrigações legais.

## 6. Direitos do titular e exclusão de conta

O entregador pode solicitar acesso, correção ou exclusão:

- **E-mail:** contato@thlgasdopovo.com.br (assunto: Exclusão de conta — App Entregador)
- **Gestor da distribuidora:** desativação do usuário no painel Gas ERP

Instruções: https://thlgasdopovo.com.br/exclusao-conta-entregador

## 7. Segurança

Credenciais armazenadas de forma segura no dispositivo; comunicação por HTTPS.

## 8. Crianças

App destinado a adultos (uso profissional). Não direcionado a menores de 18 anos.

## 9. Alterações

Esta política pode ser atualizada periodicamente. A data no topo indica a última revisão.
