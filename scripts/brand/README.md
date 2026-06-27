# Marca — Gás do Povo

Arquivos-fonte (PNG) nesta pasta:

| Arquivo | Uso |
|---------|-----|
| `app-icon.png` | Ícone do app, favicon, adaptive icon, **loader animado** |
| `splash.png` | Splash screen mobile |
| `logo-login-dark.png` | Login mobile e fundos escuros |
| `gas-cylinder-mark.png` | Símbolo do botijão (sidebar, ícones) |
| `logo-gas-do-povo.png` | Wordmark horizontal (web login) |

## Regenerar assets

```bash
python3 scripts/brand/generate-mobile-assets.py
```

Copia/redimensiona para:

- `apps/mobile/assets/` — icon, adaptive-icon, favicon, logo-login, splash
- `apps/web/public/icon.png` e `apps/web/src/app/icon.png`
- `apps/web/public/brand/` — app-icon, logo-wordmark, logo-login-dark, gas-cylinder-mark
