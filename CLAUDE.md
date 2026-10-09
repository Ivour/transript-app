# TranscribeApp

Živý přepis češtiny na text s rozlišením mluvčích (diarizace). Webová appka
(React + Vite) jen pro autora, cílové zařízení **iPhone 16 Pro, Safari**.
Vývoj a rychlé zkoušky běží často v desktopovém Chromiu (Arc) na localhostu —
audio se tam chová jinak než na iPhonu. Přepis dělá **Soniox** (realtime
WebSocket), přihlášení a vydávání klíčů **Supabase**.

Komunikace s uživatelem česky. Kód, komentáře a commity anglicky, texty v UI
česky.

## Priority (v tomto pořadí)

1. **Nízká latence** (od slova po text, a od textu po „finální“).
2. **Přesnost přepisu** a **správná diarizace** (jedna věta = jeden mluvčí).
3. Spotřeba dat a baterie.

Nezáleží na clean code, multi-tenant ani veřejných uživatelích. Použití je i
v hlučném prostředí, někdy s externím bezdrátovým mikrofonem Rode.

## Kdo za co odpovídá

Uživatel je React vývojář (medior), **audio a zpracování signálu nezná**.

- **Architektura audia je svěřená mně**: worklet, převod vzorkování, velikost
  chunků, formát, napojení na Soniox. Původně ji navrhla AI (Fable 5 v
  Clinu), takže není nedotknutelná — když existuje lepší řešení, navrhni ho
  nebo ho udělej.
- Technická rozhodnutí v audiu dělej sám a zdůvodni je. **Neptej se na věci,
  které uživatel nemůže posoudit** (délka filtru, velikost bufferu...). Ptej
  se na to, co posoudí: jak se aplikace chová (je text rychlejší, dělí se
  věta, funguje to v hluku) a na produktová rozhodnutí.
- Vysvětluj česky a bez žargonu: co se změní v praxi a co má uživatel
  vyzkoušet. Odborné pojmy (aliasing, FIR, Nyquist) patří do komentářů v
  kódu, v odpovědích je jen krátce vysvětli.
- Hodnoty (chunky, prahy, parametry Sonioxu) se ladí podle pocitu uživatele
  z reálného provozu. Změny, které ovlivní latenci, přesnost nebo UX,
  nedělej potichu: řekni, co se změnilo, jak to poznat, a rizikové věci
  dělej jako A/B přepínač (konstanta) nebo malé, snadno vratné kroky.
- U Reactu, UI a Supabase je uživatel plnohodnotný reviewer, tam stačí
  běžná technická komunikace.

## Rozhodnutí uživatele (neměnit bez dotazu)

- **Staré finální tokeny se záměrně zahazují** (`MAX_FINAL_TOKENS` v
  `useSonioxTranscription.ts`) — čte se jen konec přepisu. Není to bug.
- **16 kHz mono `pcm_s16le` stačí.** Nezvyšovat vzorkování ani bitrate,
  spotřeba dat je už teď dost vysoká. Režim slabého signálu = 8 kHz μ-law.
- **Žádný auto-reconnect.** Při pádu spojení se session ukončí chybou.
- **Nastavení UI se neukládá** (tmavý režim, velikost písma, citlivost,
  režim signálu) — po refreshi se vše vrací na výchozí. Nepřidávat
  localStorage.
- **Přepisy se nikam neukládají.** Jediná DB tabulka je `usage_sessions`.
- **Auto-stop při odchodu do pozadí** (`visibilitychange`, `pagehide`) chrání
  kredit před zapomenutou session.

## Příkazy

- Jen **pnpm** (žádné `npm`, `yarn`, `npx`; jednorázové nástroje `pnpm dlx`).
  Nikdy needitovat `pnpm-lock.yaml` ručně. Node 24 (`.nvmrc`).
- `pnpm dev` (port 5173; devcontainer ho spouští po startu), `pnpm lint`,
  `pnpm exec tsc -b --noEmit`, `pnpm build`. Testy nejsou.
- Po netriviální změně spusť lint a tsc.
- `README.md` je nezměněná šablona Vite, ignoruj ji.

## Co nemůžu ověřit

K iPhonu, mikrofonu ani prohlížeči nemám přístup. Změny v audiu, Soniox
parametrech a diarizaci proto nejsou ověřené na zařízení, dokud je
neotestuje uživatel. Po takové změně napiš, **co přesně má vyzkoušet**.

Co ověřit jde: `public/worklets/pcm-recorder-worklet.js` je čisté JS bez
importů, takže ho jde spustit v Node s podvrženými globály
(`AudioWorkletProcessor`, `registerProcessor`, `sampleRate`) a pustit přes
něj sinusovky (odezva resampleru, velikost chunků). Podobně jde testovat hooky
s falešnými časovači.

## Klíče a Supabase

- **Trvalý Soniox klíč nikdy v kódu prohlížeče.** Žije jen jako secret
  Supabase (`SONIOX_API_KEY`). `VITE_*` proměnné jsou veřejné: smí tam být jen
  `VITE_SUPABASE_URL` a `VITE_SUPABASE_ANON_KEY`.
- `.env.local` je mimo git. Neotevírej ho a nevypisuj hodnoty (kdyby bylo
  potřeba, jen názvy proměnných).
- Tok: přihlášení (Supabase Auth, jediný ručně vytvořený účet, bez
  registrace) → Edge Function `soniox-token` (ověřuje JWT, nenasazovat s
  `--no-verify-jwt`) vrátí dočasný klíč → prohlížeč se připojí **přímo** na
  Soniox. Žádný relay audia přes server.
- Edge Function: platnost klíče `TEMPORARY_KEY_TTL_SECONDS` (300 s) a
  tvrdý strop session 30 min (`MAX_SESSION_DURATION_SECONDS`, Soniox sám
  ukončí spojení). Frontend čte `expiresAt`, takže funguje s jakoukoliv
  hodnotou.
- `usage_sessions` (RLS: každý vidí a zapisuje jen své) se plní při stopu
  nebo neočekávaném ukončení. `cost_usd` je jen odhad z konstanty
  `COST_PER_HOUR`, ne skutečná fakturace. Čte to `UsagePage` (TanStack Query).
- **Nikdy sám nenasazuj ani nemigruj vzdálený Supabase** (`supabase functions
  deploy`, `db push`, `secrets set`). Změnu připrav a řekni uživateli
  příkaz. Migrace patří do `supabase/migrations`.

## Audio pipeline

Tap na Start → `useSonioxTranscription.start` → `useAudioCapture`
(`AudioContext` → `AudioWorkletNode`) a souběžně klíč z
`useSonioxKeyPrefetch` → WebSocket → tokeny → `rebuildTranscriptState` →
`TranscriptView`.

- **Žádný `MediaRecorder`** (na iOS jen mp4/AAC s velkým bufferem).
- **`AudioContext` se musí vytvořit synchronně v handleru tapu**, před
  jakýmkoliv `await` (iOS vyžaduje gesto). `RecordButton.onStart` volá
  `start()` hned, bez asynchronní předkontroly.
- **`addModule` a `getUserMedia` musí běžet za sebou.** Souběžně spuštěný
  `addModule` zůstal v Arcu navždy „pending“ (příčina nezjištěna).
- Worklet je **čisté JS v `public/`** (Vite ho vydává beze změny) a nemůže
  importovat ze `src/`. Konstanty noise gate v něm zrcadlí
  `src/audio/constants.ts` — při ladění udržuj obě místa shodná.
- `process()` běží na audio vlákně: **žádné alokace v hot path**
  (předalokované buffery), jinak hrozí výpadky zvuku.
- **Resampler (`AntiAliasResampler`)** dělá FIR low-pass před decimací
  (48→16 kHz: 145 taps, plochý do 7 kHz, nad 8,5 kHz −70 dB). Nevracet lineární
  interpolaci — bez filtru se šum a zvuk nad 8 kHz překládá do pásma řeči a
  kazí sykavky (s, š, z, č).
- Chunk **60 ms** (`CHUNK_DURATION_MS`). Menší = méně latence, víc režie.
- Worklet node má `channelCountMode: "explicit"`, aby se stereo vstup (např.
  přijímač Rode) smíchal do mono místo čtení jen levého kanálu.
- Noise gate (slider „citlivost“) běží před resamplingem a zeslabuje audio
  k nule; může useknout začátky slov, takže nezvyšovat agresivitu bez
  konzultace.
- `getUserMedia` má zapnuté `echoCancellation` a `noiseSuppression`. Je to
  otevřená otázka — na iOS to znamená voice processing, který může zhoršovat
  hlasy a diarizaci. Zvlášť u Rode stojí za test s vypnutím. Neověřeno.
- Wake Lock se drží během přepisu (`useWakeLock`).

## Soniox session

- Model `stt-rt-v5`, `language_hints: ["cs"]` striktně,
  `enable_speaker_diarization`.
- **Detekce konce promluvy** (`SONIOX_ENABLE_ENDPOINT_DETECTION` a konstanty
  vedle ní v `useSonioxTranscription.ts`) zrychluje „zčernání“ textu, ale
  podle dokumentace snižuje přesnost diarizace: věta pak může skončit u
  dvou mluvčích. Je to trade-off latence a diarizace; aktuálně konzervativní
  ladění (`max_endpoint_delay_ms` 2000, `endpoint_sensitivity` −0,5), uživatel
  ho zkouší. Token `<end>` se filtruje. `endpoint_sensitivity` a
  `endpoint_latency_adjustment_level` umí jen v5; záporná citlivost se
  nedoporučuje, když je úroveň > 0 (nastavení se pak vzájemně ruší).
- **Parametry Sonioxu před změnou ověř v dokumentaci**
  (`https://soniox.com/docs/stt/api-reference/websocket-api`); některé
  parametry jsou jen pro v5 a jiné modely je mohou odmítnout chybou 400.
- Diarizace v UI: štítek „Mluvčí N“ je podle pořadí prvního výskytu a bublina
  je souvislý běh tokenů stejného mluvčího. Jeden špatně označený token tedy
  rozdělí bublinu.
- Stop (`stop()`) pošle `finalize` a po 300 ms zavře socket bez čekání na
  `finished`. Může se tím ztratit konec poslední věty. Uživatel to zatím
  neřeší.

## Konvence

- TypeScript strict, `erasableSyntaxOnly` (žádné enumy, namespace ani
  parameter properties), `verbatimModuleSyntax` (u typů `import type`),
  `noUnusedLocals`. Alias `@/` = `src/`.
- Lint obsahuje pravidla `react-hooks` včetně těch od React Compileru
  (např. `useCallback`, který odkazuje sám na sebe, lint odmítne). Logika
  s vedlejšími efekty patří do hooků, komponenty držet „hloupé“.
- Tailwind 4 (bez `tailwind.config`, konfigurace v `src/index.css`), shadcn
  `base-nova` nad `@base-ui/react`, ikony `lucide-react`.
- Existující kód je hustě komentovaný „proč“. U nezřejmých věcí (audio, iOS,
  Soniox) v tom pokračuj, jinak stručně.
- **Nikdy necommituj ani nepushuj.** Commity i push dělá uživatel sám (ve VS
  Code). **Žádný příkaz `git` se nevolá** (ani `status`, `diff`, `log`) —
  vynucené v `.claude/settings.json` (`permissions.deny`). Změny nech v pracovním stromu a
  na konci stručně napiš, co se změnilo; zprávu commitu můžeš jen navrhnout
  (styl `feat:`, `fix:`, `chore:` + krátký anglický popis).

## Prostředí

- Devcontainer (image Node 24, pnpm přes corepack, port 5173 přeposlaný, po
  startu se spouští `pnpm run dev`). Na macOS je načítání localhostu pomalé
  kvůli sdílené složce — uživatel to vědomě neřeší, nasazená appka na iPhonu
  se toho netýká.
- `.pnpm-store/`, `node_modules/` a `dist/` jsou v `.gitignore`.
- `.clinerules` je původní soubor z Clinu a **zčásti zastaralý** (tvrdí, že
  v projektu nemá být DB ani migrace, nezná noise gate ani režim slabého
  signálu). Tento soubor má přednost. Komentáře v kódu na něj odkazují
  jako na „.clinerules section N“.

## Probrané nápady (neimplementováno)

Nejsou to rozhodnutí, jen podklad pro další ladění.

- Vyhlazení diarizace v UI: krátký úsek jiného mluvčího mezi dvěma úseky
  stejného mluvčího přilepit k okolí (riziko: ztratí se krátké „jo“ od
  druhého člověka).
- Zkusit vypnout `echoCancellation` a `noiseSuppression`, hlavně s Rode.
- Zlepšit režim slabého signálu: Opus místo μ-law (nutno ověřit podporu
  `AudioEncoder` v Safari a přijetí Sonioxem).
- WebSocket přesunout z hlavního vlákna do Web Workeru (nižší jitter při
  překreslování dlouhého přepisu).
- Soniox `context` (jména, termíny) se zamítlo: uživatel mluví pokaždé s
  někým jiným. Dávalo by smysl jen pro opakující se slova z jeho oboru.
