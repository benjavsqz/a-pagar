# Sistema de tokens + Modo oscuro — 2026-06-19

> Ronda de mejora "pro" de la paleta, aplicando `ui-ux-pro-max` (jerarquía 60/30/10, tokens semánticos, dark mode desaturado) y `frontend-design` (mantener la identidad cálida distintiva, no genericizar).

## Diagnóstico (con datos)
- **520 hex hardcodeados / 53 valores distintos** en `.tsx` → anti-patrón "raw hex in components" (flag de `ui-ux-pro-max` §6 `color-semantic`).
- **Drift real**: 3 grises casi idénticos para el mismo rol de texto (`#6b5f55`×136, `#6f6155`×11, `#6b5d50`×2); múltiples bordes (`#ece2d5`/`#e0d4c4`/`#ddccb4`) y rellenos (`#f6f1ea`/`#f1e9dd`).
- **Sin modo oscuro** (`color-scheme: light`) — una app de finanzas que se usa **de noche en restaurantes** lo pide.

## Qué se hizo

### 1. Sistema de tokens semánticos (`globals.css`)
Una sola fuente de verdad, jerarquía 60/30/10 documentada:
- **Superficies**: `--bg`, `--bg-2`, `--surface`, `--fill`, `--fill-2`
- **Líneas**: `--line`, `--line-2`
- **Texto**: `--text`, `--text-1` (nuevo), `--text-2`, `--text-3`
- **Marca/acento**: `--brand*`, `--brand-bg` (nuevo), `--violet`, `--violet-ink` (nuevo), `--violet-bg` (nuevo), `--coral*`
Drift consolidado: los 3 grises → `--text-2`; bordes → `--line`/`--line-2`; rellenos → `--fill`/`--fill-2`.

### 2. Migración hex → tokens
- **Bracket-scoped sed** (`[#hex]` → `[var(--token)]`) en 20 archivos: solo toca valores arbitrarios de Tailwind, **nunca** strings JS (ej. `themeColor: '#faf2e7'` quedó intacto).
- `bg-white` → `bg-[var(--surface)]`.
- Neutrales verificados sin modificadores de opacidad antes de migrar (cero riesgo de romper alphas).
- **Modo claro pixel-idéntico**: cada token == el valor exacto anterior.
- Acentos vívidos (`--brand`, `--violet`, semánticos) quedan como están — funcionan en ambos modos.

### 3. Modo oscuro
- `@media (prefers-color-scheme: dark)` redefine los tokens a una paleta **cálida desaturada** (no invertida): fondos café-negro, texto crema, marca/acentos aclarados para texto sobre superficies oscuras (`--brand-ink` pasa de verde oscuro a verde claro, etc.). Contrastes clave verificados numéricamente (texto-2 ≥7:1, texto-3 ≥5:1 sobre `--surface`).
- `color-scheme: light dark`; `theme-color` ahora responde a la preferencia (claro `#faf2e7` / oscuro `#17120f`).
- Sombras cálidas → neutras profundas en oscuro.

## ⚠️ Pendiente de QA visual
La **estructura** del dark mode está completa (todo token-driven) y compila (lint ✓, 23 tests ✓, build ✓), pero **los VALORES de color oscuro no se verificaron en pantalla** — no pude renderizar la app acá. Revisar en dispositivo/navegador (forzar dark) y ajustar tokens si algo se ve apagado. Es trivial de afinar: todo vive en el bloque `@media` de `globals.css`.

Residuos menores aceptables (afinar si molestan en oscuro): chips de estado amber/rojo (`#fef3c7`/`#fee2e2` + texto) siguen claros; el grano de papel (`mix-blend-mode: multiply`) se vuelve invisible sobre fondo oscuro; los blobs ambientales decorativos quedan como glows tenues.
