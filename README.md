

## Heatmapa aktywności

Panel administratora zawiera stronę `/admin/heatmap` z filtrami daty, godzin, postaci i kontynentu. W obecnym formacie danych aktywność stref jest szacowana na podstawie zdarzeń zapisywanych przez addon (m.in. EXP, walki, loot i zadania). To nie jest jeszcze mapa ciągłego położenia graczy. Obecnie współrzędne są dostępne tylko w części zdarzeń śmierci.

Aby przygotować rzeczywistą heatmapę pozycji na mapie świata, addon musi okresowo zapisywać próbki pozycji (czas, mapId, x, y oraz postać), a frontend musi używać odpowiednich map stref/koordynatów. Dopiero te dane pozwolą odtworzyć wiarygodną aktywność przestrzenną w wybranym dniu lub przedziale czasu.

**Bezpieczeństwo:** nie umieszczaj pliku `.env`, folderu `.data` ani danych z `node_modules` w archiwach przesyłanych lub commitowanych do repozytorium. Ustaw własne wartości `ADMIN_PASSWORD` i `UPLOAD_TOKEN`.

## Import dużych plików

Import SavedVariables jest wysyłany porcjami do `/api/import/chunk`, aby pojedyncze żądanie mieściło się w limicie Vercel. Skompresowane porcje są tymczasowo przechowywane w tabeli `import_upload_chunks`, a po odebraniu wszystkich części łączone, rozpakowywane i przekazywane do istniejącego importera. Porzucone porcje starsze niż 24 godziny są czyszczone podczas kolejnych żądań importu. Limit pliku po kompresji wynosi 100 MB; czas przetwarzania i rozmiar rozpakowanego pliku nadal podlegają limitom środowiska uruchomieniowego.
