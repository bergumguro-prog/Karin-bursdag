# ✨ Karins bursdag

Glitter & glam-nettside for bursdagsfesten. Gjestene registrerer navnet sitt, blir paret med en tilfeldig **dansepartner** og samler poeng sammen gjennom kvelden. Alle kan følge topplisten live, men bare vertinnene (admin) kan dele ut poeng og endre par.

## Slik fungerer det

| Hvem | Hva |
| --- | --- |
| **Gjester** (`/`) | Skriver inn navnet sitt og får en tilfeldig dansepartner, avslørt med navnehjul og gullregn. Ser parets poeng, plassering og topplisten. |
| **Toppliste** (`/#/toppliste`) | Par og personer rangert live. Rader glir til ny plass når poeng deles ut. |
| **Storskjerm** (`/#/tv`) | Par, personer og siste poeng side om side, laget for TV eller prosjektor. |
| **Admin** (`/admin`) | Logg inn med PIN. Gi eller trekk poeng, par om gjester, splitt par og fjern gjester. |

**Regler for paring**

- En ny gjest pares med en tilfeldig gjest som venter på partner.
- Er det ingen som venter, venter den nye gjesten til neste person registrerer seg. Avsløringen skjer da live på telefonen.
- Parene er låst. Bare admin kan endre dem.

**Poeng** gis per person. Parets poengsum er summen av begge partnerne. Splitter man et par, beholder hver person sine egne poeng.

## Kjøre lokalt

Krever Node.js 22.13 eller nyere (bruker innebygd `node:sqlite`).

```bash
npm install
cp .env.example .env   # og sett en egen ADMIN_PIN
npm run dev            # http://localhost:3000
npm test
```

### Miljøvariabler

| Variabel | Standard | Beskrivelse |
| --- | --- | --- |
| `ADMIN_PIN` | `1234` | Felles PIN for admin. **Bytt denne før festen!** Endrer du den, logges alle admins ut. |
| `EVENT_TITLE` | `Karins bursdag` | Tittelen på forsiden |
| `PORT` | `3000` | Porten serveren lytter på |
| `DB_PATH` | `data/bursdag.db` | Hvor SQLite-databasen lagres |

## Ta den i bruk på festen

**Alternativ A: fra en laptop på festen (enklest, gratis).** Kjør `npm start` på en laptop, og la gjestene koble seg til samme Wi-Fi. Finn laptopens IP-adresse (`ipconfig getifaddr en0` på Mac) og del `http://<ip>:3000` som en QR-kode. Koble laptopen til en TV og åpne `/#/tv`.

**Alternativ B: på nett.** Appen er en vanlig Node-server og kan kjøres hos for eksempel [Railway](https://railway.app), [Render](https://render.com) eller [Fly.io](https://fly.io):

- Byggkommando: `npm install`. Startkommando: `npm start`.
- Sett `ADMIN_PIN` (og eventuelt `EVENT_TITLE`).
- Legg til en **persistent disk/volum**, monter den for eksempel på `/data`, og sett `DB_PATH=/data/bursdag.db`. Uten den forsvinner dataene ved omstart.
- Kjør bare **én** instans, fordi sanntidsoppdateringene holdes i minnet på serveren.

## Brukerveiledning for admin

1. Gå til `/admin` (eller trykk på den lille stjernen nede i hjørnet) og skriv inn PIN-en.
2. Trykk på én eller flere gjester for å velge dem. **Velg begge** velger hele paret.
3. Velg eventuelt en begrunnelse, og trykk **+1 / +5 / +10 / −1**, eller skriv inn et eget tall.
4. Velg to gjester og trykk **Gjør til dansepartnere** for å pare dem om. De tidligere partnerne blir stående uten partner.
5. **Splitt** løser opp et par. **Fjern gjest** (med én gjest valgt) sletter gjesten og poengene deres.

## Teknisk

- `server/`: Express 5, SQLite (`node:sqlite`), Server-Sent Events for live-oppdateringer
  - `store.js`: all spillogikk (registrering, paring, poeng, toppliste)
  - `auth.js`: admin-PIN med signerte tokens (HMAC, gyldig i 24 timer) og rate-limiting
  - `events.js`: SSE-hub
- `public/`: ren HTML/CSS/JS uten byggesteg
  - `css/theme.css`: designsystemet (gull, glass, art deco)
  - `js/sparkles.js`: glitterpartikler, konfetti og gullregn på canvas
  - `js/app.js`, `js/scoreboard.js`, `js/admin.js`: gjesteflyt, toppliste og adminpanel
- `test/`: `node:test`-tester for paring, poeng og tilgangskontroll
