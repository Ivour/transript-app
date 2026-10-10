# Ladění přepisu: stav, měření, otevřené věci

Stav k 2026-10-10 (první kolo měření v testovacím buildu + první úprava kódu).
Pravidla a rozhodnutí jsou v `CLAUDE.md`; tady jsou čísla a stav jednotlivých
nápadů. Parametry Sonioxu před změnou ověř v dokumentaci.

## Stav

| Co | Stav |
|---|---|
| Zavírání WebSocketu při selhání mikrofonu / Stopu před startem / Stop → Start | **Hotovo a odzkoušeno na iPhonu 2026-10-10** (bod 10) |
| Klíč Sonioxu do protokolu WebSocketu | **Odloženo uživatelem, ale nutné před 15. 1. 2027** (bod 8) |
| Měření v hluku / s Rode (situace E) a A/B potlačení šumu, ozvěny, AGC | **Chybí** (bod 7) |
| Latence (první text 610 ms, zčernání 4,7 s) | Změřeno, v aplikaci není co zrychlit |
| Hlavní vlákno, Blob URL pro worklet, indikátor spojení | Odloženo (body 3, 4, 12) |
| EU server, ruční `finalize`, konec věty při Stopu, statistiky, odstranění bufferu | Rozhodnuto nedělat (viz dole) |

## Výsledky měření (2026-10-10)

Klidná místnost doma, stejný čtený text, výchozí nastavení, jeden běh na řádek.
`n` = počet měření v okně panelu (cíl 40, u „slovo → finál“ je `n` často malé).

| Situace | slovo → text<br>medián / p90 (n) | slovo → finál<br>medián / p90 (n) | Soniox zaostává | záseky /<br>nejdelší mezera | spojení | Poznámka |
|---|---|---|---|---|---|---|
| **A** základ (= B vyp = C 60 ms = D Wi‑Fi) | 610 / 672 ms (40) | 4,7 / 5,1 s (21) | 0 ms | 0 / 68 ms | 436 ms | rychlá Wi‑Fi |
| **B** konec promluvy **zap** | 611 / 667 ms (40) | 4,7 / 5,1 s (18) | 0 ms | 0 / 74 ms | 573 ms | posuvníky nejspíš výchozí (2000 ms, −0,5), neověřeno |
| **C** chunk 20 ms | 673 / 682 ms (40) | 4,8 / 5,4 s (19) | 0 ms | 0 / 27 ms | 649 ms | |
| **C** chunk 100 ms | 683 / 749 ms (40) | 4,8 / 5,2 s (18) | 0 ms | 0 / 105 ms | 551 ms | |
| **D** mobilní data 5G, centrum | 677 / 681 ms (40) | 4,8 / 5,1 s (19) | 0 ms | 0 / 68 ms | 538 ms | |
| **E** hluk / Rode | neměřeno | | | | | uživatel nemá jak |
| **F** dlouhá session, začátek | 611 / 669 ms (40) | 4,8 / 5,0 s (4) | 60 ms | 0 / 68 ms | 576 ms | Wi‑Fi |
| **F** dlouhá session, konec | 620 / 670 ms (40) | 4,7 / 4,9 s (40) | 120 ms | 0 / 70 ms | 576 ms | |
| **G** 5× opakovaný Start | 612 / 671 ms (40) | 4,7 / 5,1 s (3) | 120 ms | 0 / 65 ms | 1,2 s | |

Čtený text: „Za úsvitu se les probouzí pomalu. Mezi vysokými smrky se převalují
zbytky mlhy a první paprsky slunce dopadají na vlhký mech. Někde v korunách
stromů začíná zpívat drozd, brzy se k němu přidají další ptáci. Vzduch voní po
jehličí, hlíně a čerstvé rose. Potok, který se vine údolím, bublá mezi kameny
a nese s sebou listy opadané z bříz. V průzračné vodě se mihne pstruh a zmizí
pod kořeny staré olše. Na břehu se pase srnka, ale při sebemenším zvuku
zvedne hlavu a v jediném skoku zmizí v houští.“

### Co z toho plyne

- **Aplikace je zdravá:** první text ~610 ms (p90 ~670), žádné záseky.
  Opakované běhy se liší o ±10 ms.
- **Chunk:** 20 ms vyšlo o ~60 ms *hůř* než 60 ms a 100 ms o ~70 ms hůř. Teorie
  to nepodporuje, takže je to nejspíš jiná síť v jiný čas, ne chunk. Nejdelší
  mezera sleduje velikost chunku (27 / 68 / 105 ms), zvuk odchází pravidelně.
  **Zůstává 60 ms.**
- **Síť:** 5G je o ~67 ms pomalejší než Wi‑Fi, nic se nehromadí.
- **Dlouhá session:** žádné zhoršení (611 → 620 ms), hlavní vlákno není
  přetížené.
- **Spojení** 1,2 s (G) je jednorázový výkyv, schová se za prompt na mikrofon.
- **Zčernání je 4,7 s všude** (chunk, síť, délka, i s detekcí konce promluvy
  zap). Je to největší číslo a nic nastavitelného ho u souvislé řeči nezkrátí.
  Detekce zasáhne jen při pauze nebo střídání mluvčích; v monologu bez pauz
  ne. Uživatel pozoroval rychlé zčernání při střídání mluvčích u zapnuté
  detekce; **neověřeno**, jestli je rychlé i s vypnutou.
- **Z čeho se skládá 610 ms** (odhad, jen aplikace a síť jsou podložené):
  naše aplikace ~50–70 ms, síť ~100–200 ms, Soniox ~350–450 ms (dopočítané;
  model potřebuje slyšet kus zvuku za slovem). Panel nezahrnuje vstup
  mikrofonu a překreslení displeje (~20–50 ms). „Soniox zaostává 0 ms“ je
  podezřele nízké, nestavět na něm. Žádný parametr Sonioxu nezkracuje
  rozpoznání prvního textu.

## Otevřené věci

**Bod 8: termín 15. 1. 2027 (odloženo, ale nutné).** Soniox od tohoto data
odmítne spojení, které posílá klíč jen v `api_key` úvodní zprávy. Appka to
dělá. Oprava: `new WebSocket(url, ["soniox-api-key", apiKey])` a `api_key` z
úvodní zprávy vynechat (`useSonioxTranscription.ts`; `SonioxSessionConfig.api_key`
v `lib/soniox.ts` udělat nepovinný). Dokumentace: `websocket-api`,
`guides/migrate-websocket-authentication`. Riziko: dočasné klíče `snx_temp_…`
v protokolech fungují, starší `temp:` formát jen v hlavičce `Authorization`,
kterou prohlížeč nenastaví. Po změně hned zkusit Start. Návrh commitu: `feat:
send Soniox key via WebSocket protocols`.

**Bod 7: A/B v hluku (až bude situace E).** `autoGainControl: null` je výchozí
chování prohlížeče (v Safari typicky zapnuté a v hluku může „pumpovat“
hlasitost); potlačení šumu a ozvěny se posuzuje podle přepisu a mluvčích v
bublinách, ne podle čísel v panelu; `language_hints_strict` tlačí cizí slova
do češtiny. V klidné místnosti se rozdíl neprojeví.

**Odložené (nízká priorita, měření je nepotvrdilo):**
- *Bod 3, hlavní vlákno:* úroveň mikrofonu (10×/s) překresluje celou stránku a
  každá zpráva Sonioxu přestaví až 600 tokenů. Případně memoizace a ukazatel
  úrovně mimo hook; větší krok je WebSocket do Web Workeru.
- *Bod 4, start:* Blob URL pro worklet (vynechá síťové načtení, možná vysvětlí
  „pending“ v Arcu). Předotevírání WebSocketu před tapem odpadá, prompt ho
  předotevírá sám.
- *Bod 12, indikátor špatného spojení:* `socket.bufferedAmount` ukáže, že data
  uvázla; případně doporučit režim slabého signálu.

## Hotovo: bod 10, zavírání WebSocketu (odzkoušeno 2026-10-10)

Soniox účtuje **celou dobu otevřeného streamu**, ne jen zpracovaný zvuk
(dokumentace, stránka o keepalive; ~0,12 $/h). WebSocket se otevírá souběžně s
mikrofonem a drží ho keepalive, takže zapomenutý stream stojí kredit až do
30minutového stropu a ve `usage_sessions` se nezapíše.

Co se změnilo:
- `useAudioCapture.start` vrací `Promise<boolean>` (`true` = mikrofon běží).
- `useSonioxTranscription`: `sessionIdRef` (zvyšuje ho každý `start` a `stop`).
  `start` po `await takeKey()` nic neotevře, pokud mezitím přišel Stop nebo nový
  Start. Po selhání mikrofonu `start` zavře socket a nastaví stav `error`
  (hlášku ukáže `audioError`). Na začátku `start` zruší `stopTimeoutRef` (jinak
  by 300ms časovač z předchozího Stopu zavřel nově otevřený socket) a zavře
  starý socket. `stop()` je beze změny. Bez auto-reconnectu.

**Výsledek zkoušky (2026-10-10):** všechny čtyři případy níže dopadly dobře
(při Nepovolit se ukáže chyba mikrofonu). Zavřený socket uživatel přímo
nepozoroval (ani DevTools, ani Soniox Console), vyplývá z kódu a z chování
aplikace.

**Postup zkoušky na iPhonu:** (1) Start → v promptu Nepovolit → chyba mikrofonu a žádný
otevřený stream (Soniox Console nebo DevTools, Network → WS), 2× po sobě; (2)
Start → Povolit → věta → Stop se chová jako dřív; (3) Stop hned po Startu bez
textu → žádný zbylý stream; (4) Stop a ihned Start → nová session běží a
nezavře se po 300 ms.

Známá drobnost (neřešeno): Stop uprostřed promptu na mikrofon může po povolení
ukázat zbytečnou chybu mikrofonu (`useAudioCapture` nemá zrušení rozběhnutého
startu). Socket se přitom správně zavře. Návrh commitu: `fix: close Soniox
socket when mic fails or Stop beats Start`.

## Rozhodnuto nedělat (neotevírat bez nového důvodu)

- **EU server Sonioxu** (`stt-rt.eu.soniox.com`, vyžaduje EU projekt a žádost na
  support@soniox.com). Původní odhad úspory 100–150 ms je neověřitelný: US i EU
  hostitel jsou za Cloudflare (104.18.x.x), z devcontaineru se měří jen cesta k
  hraně (~60–100 ms US, 75–230 ms EU), ne k původnímu serveru. 610 ms je
  hlavně doba rozpoznávání.
- **Ruční / periodický `finalize` a zapnutí detekce konce promluvy** (bod 6):
  podle dokumentace zhoršují diarizaci, s kterou je uživatel spokojený.
- **Dohrání konce poslední věty při Stopu** (bod 9; stačilo by poslat prázdný
  textový rámec `socket.send("")` a počkat na `finished`, limit ~1,5 s). Na
  posledních větách nezáleží.
- **Změna `usage_sessions`** (bod 11): počítá se od první zprávy Sonioxu, Soniox
  účtuje od odeslání konfigurace. `cost_usd` je jen odhad.
- **Odstranění bufferu `pendingChunksRef`** (bod 4): chrání začátek věty, když
  je mikrofon rychlejší než spojení; do neotevřeného socketu nejde posílat a
  mikrofon až po otevření spojení by přidal celé zpoždění spojení.
- Stabilní štítky mluvčích po ořezu tokenů; hlasování o mluvčím po větách
  (Soniox neposílá další id ani jistotu mluvčího).

## Jak měřit

Testovací build (`VITE_APP_ENV=test`), panel „Ladění (test)“. Čísla se
obnovují 1× za sekundu a po Stopu zůstanou na obrazovce; nic se neukládá.
Nastavení se čtou při Startu, takže mezi měřeními stačí Stop, přepnout a znovu
Start. **Stránku neobnovuj** (vrátí se výchozí hodnoty a čísla zmizí).

- Číst stejný text ve stejném tempu, ~1 minutu v kuse, ≥ 30 měření (`n`). S
  menším `n` nevěřit p90 ani „slovo → finál“.
- Měnit vždy jen jednu věc; situaci nejlíp 2×, síť kolísá. Prvních pár sekund
  po Startu ignorovat.
- Dlouhá session (F): text nemusí být stejný, stačí souvislá česká řeč více
  lidí (zprávy, rozhovor) bez hudby a ticha, začátek proti konci téhož běhu.
- Detekce konce promluvy se projeví jen při pauzách nebo střídání mluvčích.
- Potlačení šumu, ozvěny a AGC hodnotit podle přepisu a mluvčích, ne podle
  čísel, a v hlučném prostředí.

| Hodnota v panelu | Co říká |
|---|---|
| **slovo → text** (medián, p90) | Za jak dlouho po konci slova se objeví první text. Priorita č. 1, rozhoduje p90. |
| **slovo → finál** | Za jak dlouho text „zčerná“, od konce slova. |
| **Soniox zaostává** | Zvuk poslaný minus zvuk, který Soniox vykázal jako zpracovaný (po 60 ms). Podezřele nízké. |
| **záseky / nejdelší mezera** | Kolikrát se zvuk zdržel v aplikaci o víc než 100 ms; nominální mezera = velikost chunku. |
| **spojení** | Čas od tapu na Start po odeslání konfigurace Sonioxu (bez čekání na „Povolit“). |
| **n** | Počet měření v okně (max. 40). |
