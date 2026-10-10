# Úkol: nasadit design livelife (React + Vite + Tailwind + shadcn/ui)

Složka je hotový design. Vzhled neměň, převeď ho do React komponent.

1. Přečti `DESIGN.md`, otevři `mockups/LiveScreen.html` – cíl 1:1. Tmavý motiv je výchozí a hlavní; světlý přes `data-theme="light"` na `<html>`.
2. CSS v tomto pořadí v hlavním CSS: `@import "tailwindcss";`, `tokens.css`, `shadcn.css`, `tailwind-theme.css`. `shadcn.css` nahrazuje vygenerované shadcn proměnné (`:root` / `.dark`) – shadcn komponenty tak převezmou barvy livelife. Tmavý motiv řídí `data-theme`, ne třída `.dark` (custom-variant je v `tailwind-theme.css`). Barvy nehardcoduj.
3. Použij shadcn tam, kde sedí: `Button` (A−/A+, motiv, signál, Start/Stop), `Slider` (práh filtru – ale přestyluj podle reference: tenká dráha s ukazatelem hlasitosti pod ním, bílý svislý palec 14×30), `Toggle` (slabý signál, `data-[state=on]:bg-warn data-[state=on]:text-on-warn`). Karty přepisu jsou vlastní komponenta, ne shadcn `Card`.
4. `reference.css` je přesný styl mockupů – přepiš do Tailwind tříd; sklo (backdrop blur), masku pod hlavičkou a šrafování filtru nech jako malé třídy v `@layer components`.
5. Komponenty: `Header`, `Transcript` → `TurnCard`, `Dock` → `LevelFilter` + řada `TextSize`, `ThemeToggle`, `LowSignalToggle`, `StartStopButton` (48 px vysoký, zbytek šířky řady).
6. Napojení:
   - Soniox diarizace: jeden tah mluvčího = jedna karta přes celou šířku (`bg-card-bg`, `border-[1.5px]` v `spkN-border`, `rounded-lg`), věty jako odstavce. N = ((speakerId-1) % 4) + 1. Žádná jména ani časy.
   - Nefinální tokeny: poslední odstavec `text-ink-muted` + blikající kurzor `bg-spkN-label`.
   - Hlasitost `--lvl` (0–100 %) na liště, práh filtru `--p` = hodnota slideru.
   - A−/A+ → `--ts` na seznamu (15–27 px, krok 2, výchozí 19, localStorage).
   - Motiv → `data-theme` na `<html>`, výchozí `dark`, localStorage.
   - Slabý signál → `data-signal="low"`: sklo → `bg-surface-solid` bez blur, neodeslané karty `border-dashed border-warn-ink` + „Ve frontě“.
   - Start/Stop: `bg-brand text-on-brand` / `bg-live text-on-live`.
7. PWA: `viewport-fit=cover`, `apple-mobile-web-app-status-bar-style=black-translucent`, `theme-color` `#0a0c0f` / `#eef1f3`. Okraje přes `env(safe-area-inset-*)` (v referenci pevné 54/26 px). Aplikace `100dvh`.
8. Logo: cesta z `assets/livelife-mark-*.svg` inline s `currentColor` (`text-brand-ink`); `assets/livelife-app-icon.svg` → `apple-touch-icon` 180×180 PNG.
9. Ověř na 390 px v tmavém i světlém motivu proti mockupům.
