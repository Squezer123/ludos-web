

## Heatmapa aktywności

Panel administratora zawiera stronę `/admin/heatmap` z filtrami daty, godzin, postaci i kontynentu. W obecnym formacie danych aktywność stref jest szacowana na podstawie zdarzeń zapisywanych przez addon (m.in. EXP, walki, loot i zadania). To nie jest jeszcze mapa ciągłego położenia graczy. Obecnie współrzędne są dostępne tylko w części zdarzeń śmierci.

Aby przygotować rzeczywistą heatmapę pozycji na mapie świata, addon musi okresowo zapisywać próbki pozycji (czas, mapId, x, y oraz postać), a frontend musi używać odpowiednich map stref/koordynatów. Dopiero te dane pozwolą odtworzyć wiarygodną aktywność przestrzenną w wybranym dniu lub przedziale czasu.

**Bezpieczeństwo:** nie umieszczaj pliku `.env`, folderu `.data` ani danych z `node_modules` w archiwach przesyłanych lub commitowanych do repozytorium. Ustaw własne wartości `ADMIN_PASSWORD` i `UPLOAD_TOKEN`.
