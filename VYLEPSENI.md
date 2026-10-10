# Návrhy na zlepšení přepisu

Stav k 2026-10-10. Jen podklad pro ladění, nic z toho není rozhodnutí ani
implementace. Seřazeno podle priorit z `CLAUDE.md` (latence, přesnost a
diarizace, spolehlivost). Tvrzení z dokumentace Sonioxu je potřeba před
změnou ověřit. U každého bodu je **Proč je to problém**, aby bylo vidět,
co konkrétně se dnes děje a čím to škodí.

## Původní otázka: zrychlí detekce konce promluvy prvotní text?

Podle dokumentace Sonioxu ne. Detekce konce promluvy zrychluje jen
finalizaci („zčernání“). Prvotní (nefinální) text Soniox posílá průběžně
tak či tak. Dokumentace ale latenci prvotního textu nepopisuje, takže
jistotu dá až měření (bod 1).

## Latence

1. **Nejdřív měřit.**
   - Soniox v každé zprávě posílá `total_audio_proc_ms`, tedy kolik zvuku
     už zpracoval. Porovnání s tím, kolik zvuku jsme odeslali, dá zpoždění
     sítě a serveru.
   - Zobrazit v testovacím panelu (spolu s RTT). Odpoví na endpoint
     zap/vyp, velikost chunku i na bod 2.
   - **Proč je to problém:** dnes se hodnoty (chunk, endpoint, mikrofon)
     ladí jen podle pocitu a z pocitu se nedá poznat, jestli zpoždění
     vzniká v zachytávání zvuku, v síti, nebo u Sonioxu. Můžeme strávit
     hodiny laděním věci, která s latencí nesouvisí.
2. **Server je v USA.** Appka se připojuje na `stt-rt.soniox.com`. Soniox
   má i EU endpoint (`stt-rt.eu.soniox.com`).
   - Vyžaduje nový projekt v regionu EU, zapnutí přes podporu Sonioxu,
     nové klíče a úpravu Edge Function (`api.eu.soniox.com`).
   - Odhad úspory ~100–150 ms na slovo. Je to jen odhad, rozhodne měření
     z bodu 1.
   - **Proč je to problém:** každý kus zvuku putuje z Česka do USA a text
     zpátky. Tuhle cestu nezrychlí žádné ladění v appce, je to pevná daň
     u každého slova a u mobilní sítě se k ní přidává kolísání.
3. **Hlavní vlákno je přetížené zbytečnou prací.** Zvuk jde worklet →
   hlavní vlákno → WebSocket, a to samé vlákno zároveň překresluje.
   - Úroveň mikrofonu mění stav 10× za sekundu a překreslí celou stránku
     včetně celého přepisu (nic není memoizované, React Compiler se
     nepoužívá).
   - Každá zpráva od Sonioxu přestaví a znovu vykreslí celý přepis, včetně
     třídění až 600 tokenů.
   - Na iPhonu 16 Pro to nejspíš není znát, ale v dlouhé session může
     zpozdit odesílání zvuku, který pak odejde ve shluku.
   - Levná oprava: ukazatel úrovně vyčlenit mimo hook, bubliny memoizovat.
     Větší krok: WebSocket do Web Workeru (už je v nápadech).
   - **Proč je to problém:** když je hlavní vlákno zrovna zaneprázdněné
     kreslením, čeká na něj i odeslání zvuku. Soniox pak dostane audio
     později a ve shluku, takže text občas zaškube nebo se zpozdí. Čím
     delší přepis, tím víc práce na každou zprávu, takže se to časem
     zhoršuje, ne zlepšuje.
4. **Start.** Safari se nenastavuje na „vždy povolit“ mikrofon, takže
   uživatel po každém tapu na Start povoluje mikrofon ručně. WebSocket se
   otevírá souběžně a bývá hotový dřív, než přijde první zvuk, takže
   `pendingChunksRef` (buffer před otevřením spojení) je obvykle prázdný.
   - Předotevírání WebSocketu před tapem tedy **odpadá**: prompt ho
     předotevírá sám. Buffer nechat, je malý a kryje případ, kdy je
     mikrofon rychlejší než spojení.
   - Zbývá Blob URL pro worklet: vynechá síťové načtení a možná vysvětlí
     i „pending“ v Arcu. Nízká priorita.
   - Hodnota „spojení“ v panelu je jen čas otevření WebSocketu. Čekání na
     klepnutí na „Povolit“ se do ní ani do zpoždění nezapočítává.
   - **Proč to dnes není velký problém:** navázání spojení se schová za
     prompt. Zbývající čekání po „Povolit“ je jen rozběh audia a první
     kousek zvuku. Mohlo by to vadit jen při pomalém spojení (výrazně
     delším než samotné klepnutí).
5. **Chunk 60 ms** není hlavní páka: zbývá max. 20–40 ms proti stovkám ms
   modelu. Nechat.
   - **Proč to není problém:** menší chunk by šetřil jen desítky ms, ale
     zvyšoval by režii a spotřebu baterie. Zisk je menší než chyba
     měření, proto to zbytečně neladit.

## Diarizace a přesnost

6. **Endpoint detection i ruční `finalize`** vynucují dřívější finalizaci,
   což podle dokumentace zhoršuje diarizaci. Nechat vypnuto.
   - **Proč je to problém:** model dostane méně času a kontextu,
     než se rozhodne, kdo mluví. Dříve se to projevilo tak, že stejný
     člověk dostal v další větě nového mluvčího. Rychlejší „zčernání“
     tedy stojí přesnost, na které uživateli záleží víc.
7. **Dvě věci k A/B zkoušce.**
   - `autoGainControl: null` = výchozí chování prohlížeče, v Safari typicky
     zapnuté. V hluku může „pumpovat“ hlasitost. Zkusit vypnout (panel to
     umí).
   - `language_hints_strict` tlačí cizí slova a jména do češtiny. Jestli
     to vadí, ukáže jen praxe.
   - **Proč je to problém:** automatická hlasitost mění úroveň zvuku
     podle okolního hluku, takže v hlučné hospodě se po každé pauze
     hlasitost „nasaje“ a začátek slova zní jinak. To může zhoršovat
     přesnost i rozlišení hlasů. Přísné jazykové nápovědy zase
     způsobí, že anglické termíny nebo jména se přepíšou jako české
     zvuky, i když zazněla anglicky. Obojí jsou dnes jen neověřené
     výchozí hodnoty.

## Spolehlivost

8. **Termín 15. 1. 2027.** Podle dokumentace Soniox přestane přijímat
   spojení, které posílá klíč jen v úvodní zprávě (`api_key`). Přesně to
   appka dělá. Klíč má jít do hlavičky nebo do seznamu protokolů
   WebSocketu (`soniox-api-key`). Před změnou ověřit v dokumentaci. Jediný
   bod s pevným termínem.
   - **Proč je to problém:** po tomto datu se appka přestane připojovat
     úplně, bez varování a bez ohledu na to, jak dobře jinak funguje.
     Zjistí se to ve chvíli, kdy bude potřeba přepis nejvíc.
9. **Konec session může ztratit poslední slabiku.**
   - `stop()` hned zruší audio kontext, takže se zahodí rozpracovaný chunk
     (až 60 ms) a ocas filtru. Po 300 ms se zavře socket.
   - Dokumentovaný způsob ukončení je prázdný textový rámec. Soniox pak
     vrátí zbytek a zprávu `finished`. Stačí počkat na ni (limit ~1,5 s) a
     worklet při stopu nechat doposlat zbytek.
   - Uživatel to zatím neřeší, jen nabídka.
   - **Proč je to problém:** poslední slovo nebo konec poslední věty
     může chybět nebo zůstat jen jako předběžný text. Je to ten
     okamžik, který uživatel nejvíc čte, protože se zrovna dozvídá, co
     bylo řečeno naposled.
10. **WebSocket zůstane otevřený, i když mikrofon nejede.** Spojení se
    otevírá nezávisle na mikrofonu a `useAudioCapture.start` chyby polyká
    (nastaví jen `error` a `status`, nevyhazuje), takže hook Sonioxu o nich
    neví. Platí to v těchto případech:
    - **Zamítnete povolení mikrofonu** (nebo mikrofon z jiného důvodu
      selže): WebSocket zůstane otevřený bez zvuku, appka ukáže chybu
      mikrofonu. Při dalším Startu se starý socket přepíše a zůstane viset.
      Protože mikrofon povolujete ručně po každém tapu, je to **běžný
      případ**, ne okrajový.
    - **Stop před dokončením startu:** když prefetch klíče selhal a jde se
      přes přímý fetch, Stop před jeho dokončením nechá otevřít „sirotčí“
      WebSocket bez mikrofonu (okrajový případ).
    - Oprava (malá): `start` vrací, jestli mikrofon běží; po neúspěchu nebo
      po Stopu zavřít socket a neotevírat nový; na začátku `start` zavřít
      případný starý socket. Bez auto-reconnectu.
    - **Proč je to problém:** appka se tváří jako zastavená nebo chybná,
      ale na pozadí zůstane otevřené spojení, které nikdo nevidí a nezavře
      (keepalive ho drží až 30 min, než Soniox session ukončí). Nemusí
      stát peníze (neposílá se zvuk), ale přesně tomuhle má auto-stop
      zabránit, a tady ho obejde.
11. **Chybí signál o špatném spojení.** Při zhoršení sítě se zpoždění tiše
    zvětšuje. `socket.bufferedAmount` ukáže, že data uvázla. Stačí
    diskrétní indikace a případně doporučení zapnout režim slabého signálu.
    - **Proč je to problém:** bez signálu uživatel vidí jen to, že text
      „jede pozadu“, a neví, jestli je chyba v appce, v mikrofonu, nebo
      v signálu. Nemůže tedy včas zapnout režim slabého signálu, který
      na to existuje, a může špatně odhadnout, co se děje.

## Měření (bod 1): co zjišťovat a kdy

Měření je hotové v testovacím buildu. Čísla jsou v panelu „Ladění (test)“
pod řádkem s nastavením, obnovují se jednou za sekundu a po Stopu na
obrazovce zůstanou, takže je můžete v klidu opsat. Nic se neukládá.

### Jak měřit, aby byla čísla srovnatelná

- Pokaždé číst **stejný text** (třeba stejný odstavec) ve stejném tempu,
  nejlíp **1 minutu v kuse**. Čekejte alespoň **30 měření** (`n` v panelu);
  s menším `n` nevěřte p90.
- Měnit **vždy jen jednu věc** (nastavení se čtou při Startu, za běhu je
  nejde přepnout).
- Každou situaci zkuste **2×**. Mobilní síť kolísá a jeden průběh nic
  neříká.
- Začněte situací A. Bez základu nemá smysl nic porovnávat.
- **Prvních pár sekund po Startu ignorujte.** Zvuk, který čekal na otevření
  spojení, odejde najednou, takže „Soniox zaostává“ chvíli ukazuje víc, než
  jaký je ustálený stav. Při ručním povolování mikrofonu to bývá skoro nic.

### Hodnoty v panelu

| Hodnota | Co říká | Kdy ji sledovat | Jak ji číst (orientačně, ověří první měření) |
|---|---|---|---|
| **slovo → text** (medián, p90) | Za jak dlouho po vyslovení slova se objeví jeho první text. Přímo vaše priorita č. 1. | Ve všech situacích A–F. | Medián je typický případ, p90 je „tak špatné je každé desáté“. Rozhoduje spíš p90, protože ten je znát při čtení. |
| **slovo → finál** (medián, p90) | Za jak dlouho text „zčerná“. | Hlavně B (endpoint zap/vyp). | Bez endpoint detection čekejte vteřiny. U zapnuté má být výrazně kratší. Samo o sobě nic neříká o přesnosti. |
| **Soniox zaostává** | Kolik zvuku už jsme poslali, ale Soniox ho ještě nezpracoval. | D (síť), A (základ). | Blízko nule = Soniox stíhá, zpoždění je ve vlastním modelu nebo v cestě tam a zpět. Stovky ms a víc = problém sítě. Pokud roste, hrozí odpojení. |
| **záseky** a **nejdelší mezera** | Kolikrát se zvuk z mikrofonu zdržel v aplikaci o víc než 100 ms. Nominální mezera je velikost chunku. | F (dlouhá session), C (chunk 20 ms), hlučné prostředí. | 0 záseků je ideál. Čím víc záseků a čím delší mezera, tím víc je aplikace přetížená (bod 3). |
| **spojení** | Čas od tapu na Start po odeslání konfigurace Sonioxu (otevření WebSocketu). Čas, který stráví klepání na „Povolit“ mikrofon, se nezapočítává. | G (opakované starty), D. | Je to jen informace o otevření spojení. Protože spojení běží souběžně s promptem, na čekání po Startu skoro nemá vliv (bod 4). |
| **n** (u medianu) | Kolik měření v posledním okně je. | Vždy. | Pod 10 jsou p90 i medián jen hrubé. |

### Situace a kdy je změřit

| # | Situace | Co změnit | Co porovnat | K čemu to je |
|---|---|---|---|---|
| A | **Základ:** Wi‑Fi, tichá místnost, výchozí nastavení, 1 minuta čtení | nic | všechny hodnoty zapsat jako výchozí | Odpovídá, jak na tom appka je dnes. |
| B | **Konec promluvy zap vs. vyp** | jen přepínač v panelu | slovo → text a slovo → finál; zároveň sledujte v bublinách, jestli se mluvčí dělí | Odpověď na původní otázku (zrychlí prvotní text?) a rozhodnutí u bodu 6. |
| C | **Velikost kousků zvuku** 20 / 60 / 100 ms | jen chunk | slovo → text (medián), záseky | Ověří, jestli stojí za to chunk měnit (bod 5). Čekám rozdíl desítek ms. |
| D | **Síť:** Wi‑Fi vs. mobilní data (a případně slabší signál) | jen síť | Soniox zaostává, spojení, p90 slovo → text | Říká, kolik zpoždění je síť. Podklad pro EU endpoint a indikátor spojení (body 2 a 11). |
| E | **Hlasité prostředí / Rode** | jen místo nebo mikrofon | slovo → text, záseky | Zjistí, jestli se zpoždění v hluku liší. O přesnosti to nic neříká, tu posuďte podle přepisu. |
| F | **Dlouhá session:** 10–15 minut souvislé řeči, ideálně v jednom běhu | nic | p90 slovo → text a záseky na začátku vs. na konci | Pokud se zhoršuje, je to přetížení hlavního vlákna (bod 3). |
| G | **Opakovaný Start:** 5× po sobě Start, pár vteřin řeči, Stop | nic | spojení | Jen informace o otevření WebSocketu (bod 4). Při ručním povolování mikrofonu nemá velký význam, stačí 2–3 starty. |

### Jak z čísel rozhodovat

- **Soniox zaostává blízko nuly a slovo → text je přesto velké:**
  zpoždění není v naší síti ani v aplikaci, ale u Sonioxu nebo na
  přímé cestě k němu. Má smysl řešit EU endpoint (bod 2).
- **Soniox zaostává velké:** problém je síť nebo odesílání. Řešit indikaci
  spojení a ověřit režim slabého signálu (bod 11).
- **Záseky větší než 0, hlavně v situaci F:** hlavní vlákno je přetížené,
  řešit bod 3.
- **B: slovo → text je zhruba stejné se zapnutou i vypnutou detekcí:**
  potvrzuje to dokumentaci, detekci nechat vypnutou a zrychlení finálního
  textu neřešit na úkor diarizace.
- **C: rozdíl menší než ~30 ms:** chunk neladit.

### Co měření nezahrnuje

- Vstupní zpoždění mikrofonu v iPhonu a vykreslení na displeji. Je to
  asi několik desítek ms a pořád stejné, takže absolutní čísla jsou o
  trochu optimistická, ale rozdíly mezi situacemi platí.
- Měří se **první zobrazení** slova. Text se může později ještě změnit.
- Odchylka hodin zvuku a telefonu může za půlhodiny přidat řádově desítky ms.
- Přesnost přepisu a diarizace to neměří. Tu hodnotíte sami.

### Tabulka na zápis výsledků

| Situace | slovo → text (med / p90) | slovo → finál (med / p90) | Soniox zaostává | záseky / max. mezera | spojení | poznámka |
|---|---|---|---|---|---|---|
| A (základ) | | | | | | |
| B: konec promluvy vyp | | | | | | |
| B: konec promluvy zap | | | | | | |
| C: chunk 20 | | | | | | |
| C: chunk 60 | | | | | | |
| C: chunk 100 | | | | | | |
| D: Wi‑Fi | | | | | | |
| D: mobilní data | | | | | | |
| E: hluk / Rode | | | | | | |
| F: dlouhá session, začátek | | | | | | |
| F: dlouhá session, konec | | | | | | |
| G: spojení (5 startů) | | | | | | |

## Doporučené pořadí

1. Bod 1 (měření zpoždění). Rozhodne o bodech 2–5 a ověří priority bez
   zásahu do audia.
2. Bod 10 (zavřít WebSocket po selhání mikrofonu). Při ručním povolování
   mikrofonu je to běžný případ a oprava je malá. Další krok k implementaci.
3. Bod 8 kvůli termínu 15. 1. 2027.
4. Body 3 a 9 jsou levné a bezpečné.
5. Bod 2 (EU) až podle čísel z bodu 1.
6. Bod 4 (Blob URL pro worklet) je nízká priorita.

## Vyřazeno rozhodnutím uživatele

- Stabilní štítky mluvčích po ořezu tokenů (číslování „Mluvčí N“ se po
  zahození starých tokenů může změnit).
- Hlasování o mluvčím po větách. Diarizace se na straně aplikace
  nevyhlazuje; Soniox žádná další id ani jistotu mluvčího neposílá.
