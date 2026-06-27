# Marca — Gás do Povo

Arquivos-fonte (PNG) nesta pasta:

| Arquivo | Uso |
|---------|-----|
| `app-icon.png` | Ícone do app, favicon, adaptive icon |
| `splash.png` | Splash screen mobile |
| `logo-login-dark.png` | Login mobile e fundos escuros |
| `gas-cylinder-mark.png` | Símbolo do botijão (sidebar, ícones) |
| `Logo Gas do Povo.pdf.png` | Wordmark horizontal (web login) |

Os SVGs antigos permanecem como referência; a geração usa os PNGs.

## Regenerar assets

```bash
python3 scripts/brand/generate-mobile-assets.py
```

Copia/redimensiona para:

- `apps/mobile/assets/` — icon, adaptive-icon, favicon, logo-login, splash
- `apps/web/public/icon.png`
- `apps/web/public/brand/` — logo-wordmark, logo-login-dark, gas-cylinder-mark
