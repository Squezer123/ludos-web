# LUDOS web

Next.js (App Router) + Drizzle + PostgreSQL: import i analiza danych z addona **LUDOS-on** (WoW Classic).

## Start

```bash
npm install
cp .env.example .env.local        # opcjonalnie
npm run dev                        # http://localhost:3000
```

Bez `DATABASE_URL` baza to PGlite (prawdziwy Postgres w procesie) zapisywana w `./.data/pglite`.
Produkcja: ustaw `DATABASE_URL` (Neon / Supabase / własny Postgres). Tabele tworzą się przy pierwszym
uruchomieniu (`src/db/ddl.ts`).

Wgranie danych: przeciągnij `LUDOS-on.lua` na `/admin` albo
`npm run import -- fixtures/foresto_test1.lua`.
Plik leży w `World of Warcraft\_classic_era_\WTF\Account\<KONTO>\SavedVariables\LUDOS-on.lua`.

## Testy

`npm run test:parser` - parser Lua + logika pochodna na prawdziwym zapisie z `fixtures/`
(działa bez instalacji, wymaga Node >= 22.18).

## Układ

```
src/lib/lua.ts        parser SavedVariables (bez zależności)
src/lib/normalize.ts  bezpieczne odczyty pól, czytanie dziennika
src/lib/derive.ts     zdarzenia -> wiersze tabel pochodnych (czysta logika)
src/lib/import.ts     idempotentny import do bazy (upsert po (sesja, n))
src/lib/queries.ts    zapytania dla widoków
src/db/schema.ts      schemat Drizzle   |   src/db/ddl.ts  ten sam schemat jako SQL
src/app/(dashboard)/  / = Przegląd gildii (sidebar); /members, /rankings, /settings to placeholdery
src/app/admin/        /admin = wgrywanie danych + lista postaci, /admin/c/[id] = szczegóły (bez zabezpieczeń)
src/app/api/import    POST /api/import
src/components/       wykresy SVG, formularz wgrywania; guild/ - komponenty widoku gildii
src/lib/guild.ts      agregaty dzienne gildii (XP, złoto, zabójstwa, aktywni gracze)
src/lib/range.ts      zakres dat (7d/30d/90d/własny) w strefie Europe/Warsaw
```

## Model danych

`events` to surowy dziennik (źródło prawdy, JSONB), klucz naturalny `(session_id, n)`.
Tabele `exp_gains`, `deaths`, `fights`, `gold_points` są pochodne i przebudowywane dla sesji przy każdym
imporcie, więc zmianę logiki wystarczy ponownie "przeliczyć" z `events`.
Import jest upsertem, bo addon poprawia stare wiersze (np. `WYLOGOWANIE` -> `RELOAD`, stan sesji).

## Uwagi o danych z addona (znalezione na próbce)

- `ZLOTO_STAN` i `RESTED` z `kiedy = "koniec"` są zawsze 0: addon czyta je w `PLAYER_LOGOUT`, kiedy gra już
  zwraca 0. Importer je pomija. Poprawka po stronie addona: zapisywać stan przy ostatnim zapisie/ticku.
- `WYLOGOWANIE.lvl` bywa nieaktualne (postać po awansie na 2 ma tam 1). Poziom liczymy z `AWANS`/`EXP`/`SMIERC`.
- `ZALOGOWANIE.strefa` jest puste (strefa nie jest jeszcze znana); prawdziwa strefa jest w następnym `STREFA`.

## Przegląd gildii (`/`)

Przegląd z kartami (aktywni gracze 7d, XP, złoto, zabójstwa) z deltą względem poprzedniego okresu
o tej samej długości, sparklinami i wykresem dziennym. Zakres i wskaźnik wykresu siedzą w adresie
(`?range=7d|30d|90d`, `?from=YYYY-MM-DD&to=YYYY-MM-DD`, `?metric=xp|gold|kills|active`).
Aplikacja obsługuje jedną gildię. Addon (schemat 2) nie zapisuje jeszcze pola `gildia`, więc gdy w bazie żadna postać go nie ma,
widok liczy po wszystkich postaciach. `GUILD_NAME` w env ustawia wyświetlaną nazwę; gdy `characters.guild` jest wypełnione,
filtruje po niej (bez env: gildia z największą liczbą postaci).
"Zarobione złoto" = zdarzenia `ZLOTO` (łup) + nagrody z `QUEST_ODDANY`. Fonty (Cormorant SC, Inter) ładuje
`next/font/google`, więc pierwszy `dev`/`build` wymaga internetu.

## Dalej

- migracje: `npx drizzle-kit generate` (config gotowy), gdy schemat się ustabilizuje
- konta/tokeny graczy zamiast jednego `UPLOAD_TOKEN`
- widoki gildii (ranking, aktywność, mapa śmierci) po włączeniu wymiany danych w addonie (`odebrane`)


## Panel administratora

Panel `/admin` jest chroniony hasłem. Skopiuj `.env.example` do `.env` i ustaw `ADMIN_PASSWORD` na własne, unikalne hasło o długości co najmniej 16 znaków. Nie udostępniaj ani nie commituj pliku `.env`. Następnie uruchom ponownie aplikację. Logowanie jest dostępne pod `/login`; sesja jest przechowywana w podpisanym, `HttpOnly` cookie przez 12 godzin. Endpoint importu wymaga aktywnej sesji administratora. Opcjonalnie ustaw także `UPLOAD_TOKEN`, aby dodać drugą warstwę ochrony importu. W produkcji korzystaj wyłącznie z HTTPS.
