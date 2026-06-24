# Configurar Resend — recuperação de senha

Guia para enviar e-mails de “Esqueci minha senha” no Gas ERP usando [Resend](https://resend.com).

---

## Visão geral

| Onde | O que configurar |
|------|------------------|
| **Resend** | Conta, domínio, API key |
| **Hostinger** | Registros DNS do domínio (SPF/DKIM) |
| **Railway** | `RESEND_API_KEY`, `EMAIL_FROM`, `WEB_URL` |

O link no e-mail usa `WEB_URL` + `/reset-password?token=...`  
Ex.: `https://thlgasdopovo.com.br/reset-password?token=abc123`

---

## Opção A — Teste rápido (sem verificar domínio)

Use só para validar que a integração funciona. **Limitação:** só envia para o **mesmo e-mail da sua conta Resend**.

### 1. Criar conta na Resend

1. Acesse https://resend.com/signup  
2. Cadastre-se (pode usar o mesmo e-mail que você usa no sistema, ex. `master@gas.com` ou seu e-mail pessoal)

### 2. Gerar API Key

1. No painel Resend → **API Keys** → **Create API Key**  
2. Nome: `gas-erp-production`  
3. Permissão: **Sending access** (ou Full access)  
4. Copie a chave — começa com `re_` (só aparece uma vez)

### 3. Variáveis no Railway

Railway → projeto da **API** → **Variables**:

| Variável | Valor (teste) |
|----------|----------------|
| `RESEND_API_KEY` | `re_xxxxxxxx` (sua chave) |
| `EMAIL_FROM` | `Gas ERP <onboarding@resend.dev>` |
| `WEB_URL` | `https://thlgasdopovo.com.br` |

Salve e faça **Redeploy** da API.

### 4. Testar

1. Abra https://thlgasdopovo.com.br/forgot-password  
2. Informe o **mesmo e-mail da conta Resend**  
3. Verifique a caixa de entrada (e spam)

> Se não configurou domínio, e-mails para outros endereços **não** serão entregues.

---

## Opção B — Produção (domínio `thlgasdopovo.com.br`)

Permite enviar para qualquer usuário do sistema (`gerente@gas.com`, clientes, etc.).

### 1. Conta e API Key

Igual à Opção A (passos 1 e 2).

### 2. Adicionar domínio na Resend

1. Resend → **Domains** → **Add Domain**  
2. Digite: `thlgasdopovo.com.br`  
3. A Resend mostrará registros DNS — algo como:

| Tipo | Nome / Host | Valor |
|------|-------------|--------|
| **TXT** | `@` ou raiz | SPF (ex. `v=spf1 include:...`) |
| **TXT** | `resend._domainkey` | DKIM (string longa) |
| **MX** | `send` (opcional) | para bounce/feedback |

Anote exatamente o que a Resend pedir — os valores mudam por conta.

### 3. Configurar DNS na Hostinger

1. Acesse https://hpanel.hostinger.com  
2. **Domínios** → `thlgasdopovo.com.br` → **DNS / Zona DNS**  
3. **Adicionar registro** para cada linha que a Resend indicou:

**Exemplo típico (valores reais vêm do painel Resend):**

```
Tipo: TXT
Nome: resend._domainkey
Valor: (copiar da Resend)
TTL: 14400 ou padrão
```

```
Tipo: TXT
Nome: @
Valor: v=spf1 include:amazonses.com ~all
(ou o SPF exato que a Resend mostrar)
```

4. Salve cada registro  
5. Volte na Resend → **Verify** no domínio  
6. Pode levar de **5 minutos a 48 horas** (geralmente &lt; 1 h)

Status deve ficar **Verified** ✅

### 4. Variáveis no Railway

| Variável | Valor (produção) |
|----------|------------------|
| `RESEND_API_KEY` | `re_xxxxxxxx` |
| `EMAIL_FROM` | `Gas ERP <noreply@thlgasdopovo.com.br>` |
| `WEB_URL` | `https://thlgasdopovo.com.br` |

Regras:
- **Sem aspas** nos valores  
- `EMAIL_FROM` deve usar um endereço do domínio verificado (`noreply@`, `contato@`, etc.)  
- `WEB_URL` = URL exata do site (onde o usuário faz login)

Redeploy da API após salvar.

### 5. Migration do banco (se ainda não rodou)

A recuperação de senha usa a tabela `PasswordResetToken`.

No Mac, com `DATABASE_URL` do Neon no `.env`:

```bash
cd ~/gas-erp
pnpm db:deploy
```

No Railway isso roda automaticamente no `releaseCommand` a cada deploy.

### 6. Testar em produção

1. https://thlgasdopovo.com.br/forgot-password  
2. E-mail de um usuário cadastrado (ex. `master@gas.com`)  
3. Abra o link do e-mail → define nova senha  
4. Login com a nova senha

---

## Checklist

- [ ] Conta Resend criada  
- [ ] API Key gerada (`re_...`)  
- [ ] Domínio `thlgasdopovo.com.br` **Verified** na Resend (produção)  
- [ ] DNS na Hostinger com registros TXT/MX da Resend  
- [ ] Railway: `RESEND_API_KEY`, `EMAIL_FROM`, `WEB_URL`  
- [ ] Redeploy da API  
- [ ] `pnpm db:deploy` (tabela `PasswordResetToken`)  
- [ ] Teste em `/forgot-password`

---

## Problemas comuns

### E-mail não chega

- Confira **Logs** no Railway — sem `RESEND_API_KEY`, o link aparece só no log  
- Resend → **Emails** — veja se consta como *delivered* ou *failed*  
- Em teste com `onboarding@resend.dev`, o destinatário deve ser o e-mail da conta Resend  
- Verifique pasta de **spam**

### Erro “domain not verified”

- Domínio ainda pendente na Resend → aguarde DNS propagar  
- `EMAIL_FROM` usa domínio diferente do verificado  

### Link do e-mail não abre / 404

- `WEB_URL` no Railway deve ser `https://thlgasdopovo.com.br` (sem barra no final)  
- Front deve estar no ar na Vercel com essa URL

### “Link inválido ou expirado”

- Token expira em **1 hora**  
- Solicite novo link em `/forgot-password`

---

## Referência rápida — variáveis Railway

```env
RESEND_API_KEY=re_sua_chave_aqui
EMAIL_FROM=Gas ERP <noreply@thlgasdopovo.com.br>
WEB_URL=https://thlgasdopovo.com.br
```

---

## Custo

- Resend **Free**: 3.000 e-mails/mês — suficiente para o MVP  
- https://resend.com/pricing
