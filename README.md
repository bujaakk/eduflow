# EduFlow

[![Live Demo](https://img.shields.io/badge/Live%20Demo-eduflowapp.web.app-0f766e?style=for-the-badge)](https://eduflowapp.web.app)
![React](https://img.shields.io/badge/React-18-2563eb?style=for-the-badge&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-f59e0b?style=for-the-badge&logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Hosting%20%2B%20Firestore-ef4444?style=for-the-badge&logo=firebase&logoColor=white)

EduFlow to platforma edukacyjna wspierana przez AI, która zamienia lekcję w konkretną pracę dla ucznia. Nauczyciel może nagrać krótkie podsumowanie lekcji albo dodać plik PDF, a system pomaga wygenerować materiały, quizy, feedback oraz widoczność postępów klasy.

Projekt powstał jako prototyp hackathonowy skupiony na ograniczeniu ręcznej pracy nauczyciela po lekcji: przygotowywania notatek, tworzenia zadań, sprawdzania odpowiedzi i kontrolowania, czy uczniowie faktycznie zrozumieli temat.

## Szybki Podgląd

- Live demo: https://eduflowapp.web.app
- Repozytorium: https://github.com/bujaakk/eduflow
- Frontend: React + Vite
- Backend i dane: Firebase Authentication, Firestore, Storage, Hosting
- AI i automatyzacje: webhooki n8n oraz zewnętrzne usługi AI/STT
- Status: działający prototyp hackathonowy gotowy do demo

## Pobranie Projektu na Innym Komputerze

Tak, projekt można normalnie pobrać z GitHuba na innym komputerze i dalej edytować.

```bash
git clone https://github.com/bujaakk/eduflow.git
cd eduflow
npm install
npm run dev
```

Po uruchomieniu serwera developerskiego Vite pokaże lokalny adres, najczęściej `http://localhost:5173`.

Jeżeli chcesz pracować na danych live albo własnych webhookach AI, utwórz lokalny plik `.env` na podstawie `.env.example`. Tego pliku zwykle nie wypycha się do GitHuba, bo może zawierać prywatną konfigurację.

Typowa praca na drugim komputerze wygląda tak:

```bash
git pull origin main
# edycja plików
npm run build
git add .
git commit -m "opis zmiany"
git push origin main
```

## Demo Live

Aplikacja produkcyjna:

https://eduflowapp.web.app

Repozytorium:

https://github.com/bujaakk/eduflow

## Jaki Problem Rozwiązuje EduFlow?

Po lekcji nauczyciel często nie ma szybkiego sposobu, aby sprawdzić:

- którzy uczniowie zrozumieli temat,
- którzy uczniowie potrzebują więcej ćwiczeń,
- co warto powtórzyć na kolejnej lekcji,
- jak przygotować sensowne materiały po lekcji bez spędzania dodatkowych godzin przy komputerze.

Uczniowie również często nie dostają natychmiastowego feedbacku. Mogą wykonać zadanie, ale nie wiedzą od razu, co było poprawne, co wymaga poprawy i gdzie wrócić do materiału.

EduFlow zamyka tę pętlę, łącząc nauczyciela, ucznia, materiał lekcyjny i wsparcie AI w jednym przepływie pracy.

## Główna Idea

EduFlow opiera się na prostej pętli nauki:

1. Nauczyciel tworzy lub nagrywa materiał z lekcji.
2. AI pomaga zamienić go w materiały dla ucznia.
3. Uczeń wykonuje zadania i otrzymuje feedback.
4. Nauczyciel widzi postęp i może szybciej reagować.

Celem nie jest zastąpienie nauczyciela. Celem jest oddanie nauczycielowi czasu na realne uczenie poprzez ograniczenie powtarzalnej pracy po lekcji.

## Najważniejsze Funkcje

### Panel Nauczyciela

Nauczyciel może:

- przeglądać przypisane klasy,
- zarządzać uczniami w klasie,
- nagrać podsumowanie lekcji,
- użyć przepływu QR do nagrywania audio telefonem,
- sprawdzić transkrypcję przed wysłaniem jej do przetwarzania,
- przeglądać utworzone lekcje,
- sprawdzać postępy uczniów,
- kontrolować status ukończenia lekcji i zadań.

### Nagrywanie Telefonem Przez QR

Jeżeli nagrywanie na komputerze jest niewygodne, nauczyciel może wygenerować kod QR. Telefon otwiera mobilną stronę nagrywania, na której można nagrać lub wgrać audio. Widok na komputerze odbiera przesłane nagranie i kontynuuje proces tworzenia lekcji.

To rozwiązanie jest przydatne w prawdziwej klasie, gdzie mikrofon laptopa może być słaby albo niedostępny.

### Panel Ucznia

Uczeń może:

- zobaczyć przypisane lekcje i ich statusy,
- rozwiązywać zadania w formie quizu,
- otrzymywać feedback po odpowiedzi,
- odblokować notatkę po wykonaniu wymaganej pracy,
- przeglądać dodatkowe materiały,
- sprawdzać profil i informacje o postępach.

### Panel Administratora

Panel administratora służy do przygotowania struktury szkoły lub środowiska:

- zarządzania środowiskami,
- tworzenia i obsługi użytkowników,
- przypisywania ról,
- tworzenia nauczycieli i uczniów,
- łączenia użytkowników z klasami.

Panel administratora jest częścią infrastruktury. Główne doświadczenie produktu to przepływ nauczyciel-uczeń.

### Obsługa Wielu Środowisk

EduFlow obsługuje routing zależny od środowiska, np.:

```text
/e/:environmentSlug/login
/e/:environmentSlug/teacher
/e/:environmentSlug/student
```

Dzięki temu osobne szkoły lub środowiska demo mogą działać w ramach jednej wdrożonej aplikacji.

## Funkcje AI

EduFlow korzysta z przepływów AI przez zewnętrzne integracje webhookowe. Konkretny model lub workflow może zostać zmieniony za warstwą webhooków, ale wartość produktu pozostaje taka sama: mniej ręcznej pracy i szybszy feedback.

### 1. Przetwarzanie Nagrania Lekcji

Audio nauczyciela jest wysyłane do webhooka audio. Workflow ma za zadanie zamienić nagranie w treść lekcji, w tym transkrypcję i uporządkowane materiały.

Wartość dla użytkownika:

> Koniec z ręcznym pisaniem notatek po każdej lekcji.

### 2. Generowanie Quizów i Zadań

Treść lekcji może zostać przekształcona w zadania dla uczniów. Nauczyciel dostaje punkt startowy zamiast tworzyć ćwiczenia od zera.

Wartość dla użytkownika:

> Jedno podsumowanie lekcji automatycznie zamienia się w pracę dla ucznia.

### 3. Ocenianie Odpowiedzi

Odpowiedzi uczniów w quizie mogą być oceniane automatycznie, co pozwala szybciej domknąć pętlę nauki.

Wartość dla użytkownika:

> Uczeń dostaje feedback od razu, zamiast czekać kilka dni.

### 4. Sprawdzanie Ćwiczeń

Aplikacja została zaprojektowana wokół wspieranego przez AI sprawdzania ćwiczeń i zadań uczniów.

Wartość dla użytkownika:

> Nauczyciel nie musi ręcznie sprawdzać każdej powtarzalnej odpowiedzi.

### 5. Chatbot Lekcji

Kierunek produktu obejmuje pomoc kontekstową dla ucznia: zamiast szukać przypadkowych odpowiedzi w internecie, uczeń może zadawać pytania dotyczące konkretnej lekcji.

Wartość dla użytkownika:

> Uczeń może dopytać o materiał, gdy nauczyciela nie ma obok.

### 6. PDF do Materiału Edukacyjnego

Nauczyciel może wgrać PDF i wysłać go do webhooka materiałów PDF. Workflow może stworzyć z istniejącego dokumentu czytelny materiał dla ucznia.

Wartość dla użytkownika:

> Stare PDF-y stają się uporządkowanymi, czytelnymi materiałami do nauki.

### 7. Zaproszenia Uczniów

EduFlow zawiera przepływy zapraszania i onboardingu uczniów. Pomaga to nauczycielom i administratorom szybciej uruchomić klasę.

Wartość dla użytkownika:

> Klasę można uruchomić bez ręcznego zakładania kont każdemu uczniowi.

## Stack Technologiczny

Frontend:

- React 18
- Vite
- React Router
- React Hook Form
- React Markdown
- Lucide React icons

Backend i infrastruktura:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Hosting
- Firebase Cloud Functions dla wybranych przepływów proxy

Integracje AI i automatyzacji:

- workflowy webhookowe n8n
- zewnętrzne usługi AI/STT za endpointami webhooków

Analityka:

- Amplitude Unified SDK, opcjonalnie i przez zmienne środowiskowe

PWA:

- Vite PWA plugin
- generowany service worker i manifest

## Struktura Projektu

```text
EduFlow/
  functions/              Firebase Cloud Functions
  public/                 publiczne assety statyczne i ikony PWA
  scripts/                skrypty pomocnicze, w tym auto backup
  src/
    assets/               assety graficzne i typografia
    components/           współdzielone komponenty UI
    contexts/             konteksty autoryzacji i środowisk
    pages/                strony aplikacji podzielone według ról
      student/            dashboard ucznia, zadania, notatki, materiały, profil
      teacher/            dashboard nauczyciela, klasy, nagrania, lekcje, profile
    services/             upload webhooków i analityka
    utils/                współdzielona logika pomocnicza
  zadania/                notatki i plany z hackathonu
```

## Ważne Ścieżki

Ścieżki publiczne i autoryzacyjne:

```text
/login
/e/:environmentSlug/login
/admin
```

Ścieżki nauczyciela:

```text
/teacher
/teacher/class/:classId
/teacher/record
/teacher/record/mobile
/teacher/lessons
/teacher/lesson/:lessonId
/teacher/student/:studentId
```

Ścieżki nauczyciela z prefiksem środowiska:

```text
/e/:environmentSlug/teacher
/e/:environmentSlug/teacher/class/:classId
/e/:environmentSlug/teacher/record
/e/:environmentSlug/teacher/record/mobile
/e/:environmentSlug/teacher/lessons
/e/:environmentSlug/teacher/lesson/:lessonId
/e/:environmentSlug/teacher/student/:studentId
```

Ścieżki ucznia:

```text
/student
/student/lesson/:taskId
/student/note/:taskId
/student/material/:materialId
/student/profile
```

Ścieżki ucznia z prefiksem środowiska:

```text
/e/:environmentSlug/student
/e/:environmentSlug/student/lesson/:taskId
/e/:environmentSlug/student/note/:taskId
/e/:environmentSlug/student/material/:materialId
/e/:environmentSlug/student/profile
```

## Zmienne Środowiskowe

Jeżeli potrzebujesz własnej konfiguracji webhooków lub analityki, utwórz lokalny plik `.env` na podstawie `.env.example`.

```env
VITE_AUDIO_WEBHOOK_URL=https://n8n.yourwayai.pl/webhook/eduflow-audio
VITE_AUDIO_WEBHOOK_SECRET=eduflow-secret-2026
VITE_AUDIO_WEBHOOK_TIMEOUT_MS=45000
VITE_AMPLITUDE_API_KEY=your_amplitude_api_key
VITE_AMPLITUDE_DASHBOARD_URL=
VITE_AMPLITUDE_EMBED_URL=
```

Dodatkowa opcjonalna konfiguracja analityki:

```env
VITE_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE=0
```

Session replay jest domyślnie wyłączony, żeby demo było stabilniejsze, a konsola przeglądarki czystsza.

## Uwagi Dotyczące Uploadu Audio

Nagrywanie na desktopie używa `MediaRecorder`. Dla kompatybilności z workflowami STT/Whisper aplikacja preferuje `audio/mp4`, jeśli przeglądarka je obsługuje, i normalizuje nagrania WebM do czystego `audio/webm` zamiast `audio/webm;codecs=opus`.

Webhook audio oczekuje jednej z dwóch form:

- binarnych danych multipart w polu `data`, albo
- zdalnego `audioUrl` dla nagrań przesłanych przez QR z telefonu.

To rozróżnienie jest ważne dla workflowów n8n, które odczytują pola binarne po nazwie.

## Uwagi Dotyczące Uploadu PDF

Upload PDF wysyła oryginalny plik PDF oraz metadane do webhooka materiałów PDF. Workflow otrzymuje kontekst klasy i nauczyciela, a następnie może utworzyć materiał w formie lekcji albo dodatkowy materiał dla ucznia.

## Uruchomienie Lokalnie

### Wymagania

- zalecany Node.js 18 lub nowszy
- npm
- dostęp do projektu Firebase, jeżeli używasz danych live lub deployu

### Instalacja Zależności

```bash
npm install
```

### Uruchomienie Serwera Developerskiego

```bash
npm run dev
```

### Build Produkcyjny

```bash
npm run build
```

### Podgląd Buildu Produkcyjnego

```bash
npm run preview
```

## Deploy na Firebase

Aplikacja jest wdrażana na Firebase Hosting.

Typowy przepływ deployu:

```bash
npm run build
firebase deploy --only hosting
```

Pliki konfiguracyjne Firebase obecne w repozytorium:

```text
firebase.json
firestore.rules
storage.rules
functions/package.json
functions/index.js
```

## Flow Demo

Mocne 3-minutowe demo może wyglądać tak:

1. Problem: nauczyciele tracą czas po lekcjach na tworzenie notatek, zadań i sprawdzanie zrozumienia.
2. Użytkownik: najpierw nauczyciel, potem uczeń, rodzic jako roadmapa.
3. Rozwiązanie: jedno podsumowanie lekcji zamienia się w pracę ucznia i wgląd dla nauczyciela.
4. Wartość AI: mniej ręcznej pracy, szybszy feedback, lepsza kontynuacja nauki po lekcji.
5. Demo nauczyciela: dashboard klasy, nagrywanie lekcji, QR do telefonu, akceptacja transkrypcji.
6. Demo ucznia: lista lekcji, wykonanie zadania, feedback, odblokowana notatka.
7. Demo materiałów: PDF zamieniony w materiał do nauki.
8. Następne kroki: panel rodzica, aplikacja mobilna, integracje ze szkołami, głębsza analityka.

Sprzedażowe hasła do demo:

- `Koniec z ręcznym robieniem notatek po każdej lekcji.`
- `Uczeń dostaje feedback od razu.`
- `Stare PDF-y stają się interaktywnymi materiałami.`
- `Nauczyciel widzi postęp, zanim klasa pójdzie dalej.`
- `AI nie zastępuje nauczyciela. AI oddaje nauczycielowi czas.`

## Aktualny Zakres Prototypu

EduFlow jest działającym prototypem hackathonowym. Obecna aplikacja pokazuje:

- autoryzację opartą o role,
- dashboard nauczyciela i ucznia,
- zarządzanie klasami i uczniami,
- przepływ nagrywania lekcji,
- mobilny przepływ nagrywania przez QR,
- punkty integracji z webhookami AI,
- przepływ zadań ucznia,
- przeglądanie materiałów,
- routing wielu środowisk,
- trwałość danych opartą o Firebase.

Część zachowań AI zależy od zewnętrznych workflowów n8n oraz dostępności i konfiguracji podłączonych usług AI.

## Roadmapa

Planowane usprawnienia po hackathonie:

- panel rodzica z widocznością postępów ucznia,
- dedykowana aplikacja mobilna dla ucznia,
- integracje z dziennikami, takimi jak Librus lub Vulcan,
- głębsza analityka klasy i rekomendacje,
- bogatsze narzędzia edycji wygenerowanych zadań i notatek dla nauczyciela,
- lepsza obserwowalność błędów workflowów AI,
- automatyczne testy end-to-end dla ścieżki demo nauczyciel-uczeń.

## Status Repozytorium

Główna gałąź:

```text
main
```

Remote:

```text
origin https://github.com/bujaakk/eduflow.git
```

## Licencja

Projekt nie ma jeszcze jawnie dodanej licencji. Przed publiczną lub komercyjną dystrybucją należy ją dodać.
