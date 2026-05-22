# EduFlow — Zadania: Eryk (Design & Branding — Figma)

## Kontekst projektu
Projektujesz cały design system i UI aplikacji edukacyjnej EduFlow.
Twoje deliverables trafiają do Bujaka który implementuje je w React.
Priorytet: czysto, nowocześnie, edukacyjnie — prosta nawigacja dla nauczyciela i ucznia.

---

## Branding

- [x] **Logo EduFlow** — czysty, edukacyjny styl
  - Wersja pozioma (pełna nazwa) + wersja ikonka (symbol)
  - Format: SVG eksport (wektorowo)
  - Odmiany: jasne tło, ciemne tło
- [x] **Paleta kolorów** — zdefiniuj w Figma jako tokeny:
  - Primary (kolor akcji, CTA, linki)
  - Secondary (akcent)
  - Background (główne + karty)
  - Text (główny + subtelny + disabled)
  - Status colors: 🔒 locked (szary), ⏳ in progress (żółty/pomarańczowy), ✅ done (zielony)
  - Error / Warning / Success
- [x] **Typografia** — wybierz 1-2 fonty Google Fonts:
  - Display/heading font (tytuły, nagłówki)
  - Body font (treść, labele, przyciski)
  - Zdefiniuj skale: H1, H2, H3, Body Large, Body, Small, Caption

---

## Design System (komponenty Figma)

- [x] **Przyciski:** Primary, Secondary, Ghost, Destructive — każdy w stanach: default, hover, disabled
- [x] **Inputy:** text field, password field — stany: empty, focused, error, filled
- [x] **Karty lekcji** z 3 wariantami statusu (🔒 / ⏳ / ✅)
- [x] **Badge/tag** — do słabych stron ucznia, pojęć
- [x] **Avatar** — inicjały lub placeholder dla ucznia/nauczyciela
- [x] **Modal** — szablon dla popupów (np. „Dodaj ucznia")
- [x] **Toast notyfikacja** — sukces, błąd
- [x] **Progress bar** — do postępów ucznia
- [x] **Loader** — spinner lub skeleton card

---

## UI — Panel Nauczyciela

- [x] **Ekran logowania/rejestracji** — wybór roli (Nauczyciel / Uczeń) + formularz
- [x] **Strona główna nauczyciela:**
  - Powitanie z imieniem
  - Karty klas (nazwa, przedmiot, liczba uczniów)
  - Statystyki skrótowe
- [x] **Widok klasy:**
  - Lista uczniów w tabeli/liście (imię, email, status)
  - Przycisk „Dodaj ucznia" widoczny i dostępny
- [x] **Profil ucznia (widok nauczyciela):**
  - Nagłówek z danymi ucznia
  - Sekcja postępów
  - Historia zadań
  - Słabe strony (tagi/chipsy)
  - Rekomendacja AI (wyróżnione pole)
- [x] **Lista lekcji nauczyciela:**
  - Karty lub tabela lekcji
  - Statystyki per lekcja
- [x] **Ekran nagrywania lekcji:**
  - Duży przycisk start/stop nagrywania
  - 4 prompty pomocnicze widoczne na ekranie podczas nagrywania
  - Wskaźnik czasu (max 3 min)
  - Stan po nagraniu: podgląd + przycisk „Wyślij"

---

## UI — Panel Ucznia

- [x] **Ekran logowania ucznia** — email + 6-cyfrowy kod (osobny widok niż nauczyciel)
- [x] **Strona główna ucznia:**
  - Imię, klasa, lista nauczycieli
  - Podsumowanie postępów
- [x] **Lista lekcji ucznia:**
  - Karty z wyraźnymi statusami (🔒 / ⏳ / ✅)
  - Wizualnie jasne co można kliknąć a co zablokowane
- [x] **Widok lekcji — zadania:**
  - Pytanie + pole odpowiedzi
  - Feedback AI po wysłaniu (wyróżnione wizualnie — np. kolor tła, ikona)
  - Pasek postępu: „Pytanie 2/4"
- [x] **Animacja odblokowania notatki 🔓:**
  - Wow moment — wyraźna animacja (zamknięta kłódka → otwarta → reveal notatki)
  - Dostarcz: specyfikację animacji (opis + timing) LUB gotowy asset (Lottie JSON / SVG animacja)
- [x] **Widok notatki:**
  - Czytelna typografia, nagłówki, pogrubione pojęcia
  - Mini-chatbot na dole lub w sidebarze: pole input + lista wiadomości
- [x] **Mój profil ucznia:**
  - Klasa, nauczyciele
  - Wykres lub wizualizacja postępów
  - Słabe strony (tagi)

---

## Demo / Prezentacja (hackathon)

- [x] **Slajd intro** do prezentacji jury (otwierający demo — 90 sekund)
  - Logo EduFlow + tagline
  - Problem w 1 zdaniu
  - Rozwiązanie w 1 zdaniu
  - Estetyczny, nie przeładowany
- [x] Ewentualnie: krótkie wideo intro lub animacja (opcjonalne, jeśli zostanie czas)

### Demo — co pokazujemy per rola (do narracji Eryka)

#### 1) Co może robić admin
- Wejść do panelu `/admin` (hasło demo: `hackaton`).
- Zarządzać nauczycielami: dodać konto nauczyciela i edytować podstawowe dane.
- Zarządzać klasami: tworzyć klasy i przypisywać je do nauczyciela.
- Utrzymać porządek danych przed demem (szybkie poprawki list nauczycieli i klas).

#### 2) Co może robić uczeń
- Zalogować się kodem zaproszenia (pierwsze wejście) i ustawić własne hasło.
- Zobaczyć swoją listę lekcji oraz statusy: zablokowana / w trakcie / zaliczona.
- Rozwiązywać pytania do lekcji i dostać natychmiastowy feedback AI.
- Odblokować notatkę po wykonaniu zadań i wrócić do niej później.
- Sprawdzić profil z postępem oraz obszarami do poprawy.

#### 3) Co może robić rodzic (wstępnie)
- Otrzymywać prosty podgląd postępów dziecka: ile lekcji zaliczone, ile czeka.
- Widzieć sygnały ryzyka: tematy/problemowe obszary, które wymagają powtórki.
- Dostawać krótkie rekomendacje „co powtórzyć w domu”.
- W MVP traktujemy to jako kierunek produktu i narrację roadmapy, nie pełny panel produkcyjny.

---

## Eksport do Reacta

- [x] Wszystkie ikony jako SVG (nie PNG)
- [x] Logo w SVG
- [x] Asset animacji odblokowania: Lottie JSON (preferowany) lub SVG z CSS animation spec
- [x] Kolory i fonty udostępnione Bujakowi jako lista zmiennych CSS (`--color-primary`, `--font-display`, itd.)
- [x] Figma: oznacz komponenty jako „Ready for dev" gdy gotowe

---

## Priorytety MVP (hackathon)

**Must have (w tej kolejności):**
1. Paleta kolorów + typografia (Bujak zaczyna implementację)
2. Ekran logowania (nauczyciel + uczeń)
3. Karty lekcji z 3 statusami (🔒 / ⏳ / ✅)
4. Ekran nagrywania lekcji
5. Widok zadań ucznia + feedback AI
6. Animacja odblokowania notatki 🔓 ← kluczowy wow moment demo
7. Slajd intro na prezentację

**Nice-to-have:**
- Profil ucznia z wykresem
- Mini-chatbot UI
- Design system kompletny ze wszystkimi stanami
