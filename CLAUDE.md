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

Čistý a čitelný kód je důležitý, ale není to priorita: když je v konfliktu s
latencí nebo přesností, ustupuje. Multi-tenant ani veřejní uživatelé se
neřeší. Použití je i v hlučném prostředí, někdy s externím bezdrátovým
mikrofonem Rode.

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
- **EU server Sonioxu se neřeší.** Přínos nejde ověřit (US i EU hostitel jsou
  za Cloudflare, měří se jen cesta k hraně) a latence je hlavně doba
  rozpoznávání. Neotevírat znovu bez nového důvodu.
- **Detekce konce promluvy zůstává vypnutá** a ruční/periodický `finalize` se
  nepřidává (zhoršují diarizaci, s kterou je uživatel spokojený).
- **Dohrání konce poslední věty při Stopu se neřeší** (čekání na `finished`).
  Důležité je jen správné zavření session (kredit Sonioxu).
- **Statistiky `usage_sessions` se nemění**, i když se počítají od první zprávy
  Sonioxu a Soniox účtuje od odeslání konfigurace (čekání na „Povolit“ se
  ztrácí). `cost_usd` je jen odhad.
- **Buffer `pendingChunksRef` zůstává.** Na iPhonu bývá prázdný, ale chrání
  začátek věty, když je mikrofon rychlejší než spojení (desktopový Chromium,
  pomalé spojení, klíč bez prefetche).
- **Nastavení UI se neukládá** (tmavý režim, velikost písma, citlivost,
  režim signálu) — po refreshi se vše vrací na výchozí. Nepřidávat
  localStorage.
- **Přepisy se nikam neukládají.** Jediná DB tabulka je `usage_sessions`.
- **Auto-stop při odchodu do pozadí** (`visibilitychange`, `pagehide`) chrání
  kredit před zapomenutou session.
- **Safari se nenastavuje na „vždy povolit“ mikrofon.** Uživatel ho povoluje
  ručně v promptu po každém tapu na Start. Důsledky: WebSocket (otevírá se
  souběžně s mikrofonem) je obvykle otevřený dřív, než přijde první zvuk, takže
  `pendingChunksRef` bývá prázdný; předotevírat spojení před tapem nemá smysl;
  doba do prvního textu závisí i na tom, jak rychle uživatel klepne na
  „Povolit“ (do měření ve `TuningPanel` se nezapočítává).

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
- **`useAudioCapture.start` chyby mikrofonu polyká** (nastaví jen `error` a
  `status`, nevyhazuje) a vrací `Promise<boolean>` (`true` = mikrofon běží).
  `useSonioxTranscription.start` podle toho po selhání mikrofonu zavře
  WebSocket, který se otevírá souběžně (Soniox účtuje celý otevřený stream).
  Chybu mikrofonu ukazuje UI z `audioError`. Ověřeno na iPhonu 2026-10-10
  (viz `VYLEPSENI.md`, bod 10); zavření socketu samo uživatel přímo
  nepozoroval, vyplývá z kódu a z chování aplikace.
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
  Měření 20 / 60 / 100 ms nic nezlepšilo, zůstává 60 ms.
- Worklet node má `channelCountMode: "explicit"`, aby se stereo vstup (např.
  přijímač Rode) smíchal do mono místo čtení jen levého kanálu.
- Noise gate (slider „citlivost“) běží před resamplingem a zeslabuje audio
  k nule; může useknout začátky slov, takže nezvyšovat agresivitu bez
  konzultace.
- `getUserMedia` má `echoCancellation` a `noiseSuppression` **vypnuté**
  (`MIC_*` v `audio/constants.ts`): na iOS zapínají voice processing, který
  mění zabarvení hlasu a zhoršuje diarizaci (dvě podobné ženy se slily).
  Od 2026-10-11 je vypnuté i `autoGainControl` (`MIC_AUTO_GAIN_CONTROL`,
  rozhodl uživatel): v pauzách by zesilovalo hluk a vedlejší stůl. Cena:
  tichý vzdálený hlas se nezesílí. Neověřeno v hlučném prostředí a s Rode,
  k porovnání slouží ladicí panel (viz níže, u AGC i „výchozí“ =
  prohlížeč).
- **Ladicí panel** (`TuningPanel`, `lib/tuning.ts`; od 2026-10-11 ve všech
  buildech, rozhodl uživatel, `VITE_APP_ENV` se už nečte): přepínače pro detekci konce promluvy, ozvěnu, šum,
  automatickou hlasitost a velikost chunku, plus diagnostika (vzorkování
  mikrofonu, surové ID mluvčího ze Sonioxu) a měření latence (slovo → text,
  slovo → finál, záseky, `lib/latencyStats.ts`; čísla zůstanou po Stopu na
  obrazovce). Hodnoty se čtou při Startu, neukládají se; mezi měřeními se
  proto nic neobnovuje, stačí Stop, přepnout a znovu Start. Každé načtení
  stránky začíná s `DEFAULT_TUNING`.
- Wake Lock se drží během přepisu (`useWakeLock`).

## Soniox session

- Model `stt-rt-v5`, `language_hints: ["cs"]` striktně,
  `enable_speaker_diarization`.
- **Detekce konce promluvy** (`endpointDetection` v `DEFAULT_TUNING`,
  `lib/tuning.ts`) zrychluje „zčernání“ textu, ale podle dokumentace snižuje
  přesnost diarizace: stejný člověk dostával v další větě nového mluvčího.
  Je **vypnutá**; zapnutí je trade-off latence a diarizace (při zapnutí se
  použije `max_endpoint_delay_ms` 2000, `endpoint_sensitivity` −0,5).
  Ostatní Soniox parametry diarizace nemá, počet mluvčích ani práh
  podobnosti hlasů se nastavit nedá. Token `<end>` se filtruje. `endpoint_sensitivity` a
  `endpoint_latency_adjustment_level` umí jen v5; záporná citlivost se
  nedoporučuje, když je úroveň > 0 (nastavení se pak vzájemně ruší).
  Změřeno (2026-10): zapnutá detekce nezrychlila ani první text (611 vs
  610 ms), ani „zčernání“ souvislé řeči jednoho mluvčího (4,7 s v obou
  případech). Soniox větu uzavře až při pauze nebo střídání mluvčích; v
  monologu bez pauz se detekce neprojeví.
- **Parametry Sonioxu před změnou ověř v dokumentaci**
  (`https://soniox.com/docs/stt/api-reference/websocket-api`); některé
  parametry jsou jen pro v5 a jiné modely je mohou odmítnout chybou 400.
- Diarizace v UI: barva (a štítek „Mluvčí N“) se přiděluje jednou za session
  (`SpeakerRegistry` v `useSonioxTranscription.ts`), ořez tokenů ji nemění.
  Nové ID dostane nejdéle nepoužitou ze 4 barev (LRU), aby páté ID (hluk,
  vedlejší stůl) nepřebralo barvu aktivního člověka. Dřív se barvy počítaly
  jen z tokenů v okně a při ořezu se přeházely; v hospodě (2026-10-10) to
  vypadalo, jako by diarizace po čase přestala fungovat. Bublina je souvislý
  běh tokenů stejného mluvčího. Jeden špatně označený token tedy rozdělí
  bublinu.
- Stop (`stop()`) pošle `finalize` a po 300 ms zavře socket bez čekání na
  `finished`. Může se tím ztratit konec poslední věty. **Uživatel to
  neřeší** (na posledních větách nezáleží), důležité je jen, aby se session
  vždy správně zavřela.
- **Soniox účtuje celou dobu otevřeného streamu, ne jen zpracovaný zvuk**
  (dokumentace, stránka o keepalive), včetně prostojů s keepalive. Otevřený
  WebSocket bez mikrofonu tedy stojí kredit (~0,12 $/h, strop 30 min z
  `MAX_SESSION_DURATION_SECONDS`). Proto je důležité zavřít socket při selhání
  mikrofonu, při Stopu před dokončením startu a při novém Startu
  (`sessionIdRef` a zrušení časovače ve `start`/`stop`, hotovo, na iPhonu
  odzkoušeno 2026-10-10).
- **Klíč se posílá jen v úvodní zprávě (`api_key`), což Soniox od 15. 1. 2027
  odmítne.** V prohlížeči musí klíč jít přes seznam protokolů WebSocketu:
  `new WebSocket(url, ["soniox-api-key", klíč])`, `api_key` se pak z úvodní
  zprávy vynechá. **Odloženo uživatelem, ale termín platí** (viz „Otevřené
  úkoly“). Funguje jen s dočasnými klíči ve formátu `snx_temp_…` (starší
  `temp:` formát jen v hlavičce `Authorization`, kterou prohlížeč nenastaví).

## Otevřené úkoly (stav k 2026-10-10)

Podrobnosti, zdůvodnění a výsledky měření jsou ve `VYLEPSENI.md`.

1. **Klíč Sonioxu do protokolu WebSocketu** — nutné před **15. 1. 2027**
   (`VYLEPSENI.md`, bod 8). Uživatel to zatím odložil, připomeň to při práci na
   spojení se Sonioxem.
2. **Měření v hluku / s Rode** (situace E) a podle přepisu rozhodnout o
   potlačení šumu, ozvěny a automatické hlasitosti (`VYLEPSENI.md`, bod 7).
3. Zavírání WebSocketu je odzkoušené na iPhonu (Nepovolit, Stop hned po
   Startu, Stop a ihned Start; 2026-10-10). Zbývá známá drobnost: Stop
   uprostřed promptu může po povolení ukázat zbytečnou chybu mikrofonu.
4. Návrh commitu pro uživatele: `fix: close Soniox socket when mic fails or
   Stop beats Start`.

## Naměřená latence (test build, 2026-10)

Wi‑Fi, klidná místnost, čtení textu, výchozí nastavení. Podrobnosti a celá
tabulka jsou ve `VYLEPSENI.md`.

- **První text: ~610 ms (p90 ~670 ms), „zčernání“ ~4,7 s (p90 ~5,1 s), záseky
  0.** 5G data jsou o ~70 ms pomalejší. Dlouhá session se nezhoršuje.
- Odhad složení 610 ms: naše aplikace ~50–70 ms, síť ~100–200 ms, zbytek
  (~350–450 ms) rozpoznávání u Sonioxu. Aplikace do latence přidává málo,
  **v audio pipeline ani v Reactu není co zrychlit**. Rozhodovat podle
  dalších čísel z panelu, ne podle dojmu.
- Velikost chunku nic nezlepšila (20 ms a 100 ms vyšlo o 60–70 ms *hůř* než
  60 ms, nejspíš šum měření) → nechat 60 ms.
- Čísla v panelu: „Soniox zaostává“ je podezřele nízké (nestavět na něm);
  „slovo → finál“ potřebuje víc měření (v některých bězích je `n` pod 10).
- Chybí měření v hluku a s Rode (situace E).

## Konvence

- TypeScript strict, `erasableSyntaxOnly` (žádné enumy, namespace ani
  parameter properties), `verbatimModuleSyntax` (u typů `import type`),
  `noUnusedLocals`. Alias `@/` = `src/`.
- Lint obsahuje pravidla `react-hooks` včetně těch od React Compileru
  (např. `useCallback`, který odkazuje sám na sebe, lint odmítne). Logika
  s vedlejšími efekty patří do hooků, komponenty držet „hloupé“.
- Tailwind 4 (bez `tailwind.config`, konfigurace v `src/index.css`), shadcn
  `base-nova` nad `@base-ui/react`, ikony `lucide-react`.
- **Design livelife** (`livelife-design/` = podklad a mockupy). V kódu:
  `src/styles/tokens.css` (barvy podle motivu), `shadcn.css` (mapování),
  `theme.css` (`@theme` statické hodnoty + `@theme inline` barvy). Barvy jen přes tokeny (`bg-canvas`,
  `text-ink`, `border-spk1-border`…), žádné `slate-*`. Motiv řídí
  `data-theme` na `<html>` (výchozí tmavý, `useTheme`), varianta `dark:`
  na něj reaguje. Sklo (utilita `glass`) jen na hlavičce, docku a kartách na
  Využití; bubliny přepisu zůstávají plné kvůli čitelnosti (průsvitné se
  zkoušely 2026-10-11, rozdíl skoro nebyl vidět). Režim slabého signálu
  (`data-signal="low"`) mění sklo na plné pozadí. Vědomé odchylky od
  `IMPLEMENT.md`: bez localStorage, bez „Ve frontě“ (appka nemá frontu
  textu), bez blikajícího kurzoru, nefinální text `ink-partial` (výraznější
  než `ink-muted`), výraznější okraje mluvčích, bez dělení karty na odstavce, slider filtru ukazuje dB na škále
  noise gate.
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
- Zlepšit režim slabého signálu: Opus místo μ-law (nutno ověřit podporu
  `AudioEncoder` v Safari a přijetí Sonioxem).
- WebSocket přesunout z hlavního vlákna do Web Workeru (nižší jitter při
  překreslování dlouhého přepisu).
- Soniox `context` (jména, termíny) se zamítlo: uživatel mluví pokaždé s
  někým jiným. Dávalo by smysl jen pro opakující se slova z jeho oboru.
