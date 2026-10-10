
livelife – jednostránková PWA (React + Vite + Tailwind) pro iPhone na živý přepis s rozlišením mluvčích. Styl Liquid Glass (iOS 26/27): sklo jen na hlavičce a docku, obsah je plný a čitelný.

## Obrazovka
1. Hlavička: znak + `livelife`, vpravo Využití a Odhlásit.
2. Karty přepisu přes celou šířku – nejdůležitější část. Bez jmen a časů: mluvčí = barevný okraj karty.
3. Dock: hlasitost s prahem filtru; pod ní A−/A+, motiv, slabý signál a Start/Stop v jedné řadě.

## Barva
- `canvas` / `ink` / `ink-muted`; hlavní akce `brand` + `on-brand`; značka v textu `brand-ink`.
- Mluvčí 1–4: karta `card-bg` s okrajem `spkN-border`, kurzor `spkN-label`. Od pátého se barvy opakují.
- Tmavý motiv je hlavní (první v tokenech).
- `live` = nahrávání, `warn` / `warn-ink` = slabý signál. Jinde nepoužívat.

## Sklo a tvar
- Sklo: `glass` + `blur-glass` + `glass-edge` + `glass-shadow`, jen hlavička a dock.
- Slabý signál: sklo → `surface-solid`, bez blur a ambientního pozadí.
- Dock `radius-xl`, bubliny `radius-lg` s rohem `radius-tail` na straně mluvčího, ovladače pilulky.

## Písmo
Systémové SF: `sans` na text, `rounded` na název a A−/A+. Přepis `transcript` 19 px, uživatel mění 15–27 px.

## Ikony
Inline SVG, 24 px mřížka, tah 2 px, `currentColor` (náhrada za SF Symbols).

## PWA
`viewport-fit=cover`, `black-translucent` status bar, okraje z `env(safe-area-inset-*)`, `theme-color` `#eaf0f1` / `#060b0d`, motiv `data-theme` na `<html>`.
