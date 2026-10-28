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

Krever Node.js 22.13 eller nyere.

```bash
npm install
cp .env.example .env   # og sett en egen ADMIN_PIN
npm run dev            # http://localhost:3000
npm test
```

Lokalt lagres alt i en SQLite-fil (`data/bursdag.db`). Slett filen for å nullstille.

### Miljøvariabler

| Variabel | Standard | Beskrivelse |
| --- | --- | --- |
| `ADMIN_PIN` | `1234` | Felles PIN for admin. **Bytt denne før festen!** Endrer du den, logges alle admins ut. |
| `EVENT_TITLE` | `Karins bursdag` | Tittelen på forsiden |
| `PORT` | `3000` | Porten serveren lytter på |
| `DB_PATH` | `data/bursdag.db` | Lokal SQLite-fil, brukes når Turso ikke er satt opp |
| `TURSO_DATABASE_URL` | – | Turso-database (`libsql://…`). Når denne er satt, brukes Turso. |
| `TURSO_AUTH_TOKEN` | – | Token for Turso-databasen |

## Legge den på nett gratis (Render + Turso)

Gjestene kobler seg til med mobildata, uten Wi-Fi. Render kjører serveren og Turso lagrer dataene, og begge har gratisplaner. Sjekk gjerne gjeldende vilkår på sidene deres.

**1. Lag databasen i Turso**

1. Lag en konto på [turso.tech](https://turso.tech).
2. Lag en database, for eksempel `karin-bursdag`, i en region i Europa.
3. Kopier **database-URL-en** (`libsql://…`) og lag et **token** (*Create token*). Begge trengs i neste steg.

Tabellene opprettes automatisk første gang appen starter.

**2. Deploy til Render**

1. Lag en konto på [render.com](https://render.com) og koble til GitHub.
2. Velg **New → Blueprint** og velg dette repoet. `render.yaml` setter opp alt.
3. Fyll inn `ADMIN_PIN`, `TURSO_DATABASE_URL` og `TURSO_AUTH_TOKEN` når du blir spurt.
4. Etter et par minutter får du en adresse som `https://karin-bursdag.onrender.com`. Lag en QR-kode av den.

**Greit å vite om gratisplanen hos Render**

- Serveren sovner etter rundt 15 minutter uten besøk, og første besøk etterpå tar opptil ett minutt. **Åpne siden selv en stund før gjestene kommer**, så er den våken. Under festen holder gjestenes åpne sider den i gang.
- Starter serveren på nytt, går det fint: alt ligger i Turso. Gjestene kobler seg til igjen automatisk.
- Kjør bare **én** instans, fordi sanntidsoppdateringene holdes i minnet på serveren.

**Alternativ: fra en laptop.** Kjør `npm start` på en laptop og del adressen på samme Wi-Fi, eller bruk `cloudflared tunnel --url http://localhost:3000` for en gratis offentlig adresse (den endres ved hver omstart).

## Brukerveiledning for admin

1. Gå til `/admin` (eller trykk på den lille stjernen nede i hjørnet) og skriv inn PIN-en.
2. Trykk på én eller flere gjester for å velge dem. **Velg begge** velger hele paret.
3. Velg eventuelt en begrunnelse, og trykk **+1 / +5 / +10 / −1**, eller skriv inn et eget tall.
4. Velg to gjester og trykk **Gjør til dansepartnere** for å pare dem om. De tidligere partnerne blir stående uten partner.
5. **Splitt** løser opp et par. **Fjern gjest** (med én gjest valgt) sletter gjesten og poengene deres.

## Teknisk

- `server/`: Express 5, SQLite/Turso via `@libsql/client`, Server-Sent Events for live-oppdateringer
  - `store.js`: all spillogikk (registrering, paring, poeng, toppliste)
  - `auth.js`: admin-PIN med signerte tokens (HMAC, gyldig i 24 timer) og rate-limiting
  - `events.js`: SSE-hub
- `public/`: ren HTML/CSS/JS uten byggesteg
  - `css/theme.css`: designsystemet (gull, glass, art deco)
  - `js/sparkles.js`: glitterpartikler, konfetti og gullregn på canvas
  - `js/app.js`, `js/scoreboard.js`, `js/admin.js`: gjesteflyt, toppliste og adminpanel
- `test/`: `node:test`-tester for paring, poeng og tilgangskontroll
