# EduFlow

[![Live Demo](https://img.shields.io/badge/Live%20Demo-eduflowapp.web.app-0f766e?style=for-the-badge)](https://eduflowapp.web.app)
[![CI](https://img.shields.io/github/actions/workflow/status/bujaakk/eduflow/ci.yml?branch=main&style=for-the-badge&label=CI)](https://github.com/bujaakk/eduflow/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-1f2937?style=for-the-badge)](LICENSE)
![React](https://img.shields.io/badge/React-18-2563eb?style=for-the-badge&logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-f59e0b?style=for-the-badge&logo=vite&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Hosting%20%2B%20Firestore-ef4444?style=for-the-badge&logo=firebase&logoColor=white)

EduFlow to aplikacja edukacyjna wspierana przez AI, która skraca czas pracy nauczyciela po lekcji i przyspiesza feedback dla ucznia.

Nauczyciel nagrywa podsumowanie lekcji (lub dodaje PDF), a system pomaga zamienić je w praktyczne zadania, notatki i materiały do dalszej nauki.

## Dlaczego EduFlow

- mniej ręcznej pracy po lekcji,
- szybsza pętla: nauczyciel -> uczeń -> feedback,
- większa widoczność postępów klasy,
- gotowość do prezentacji klientom i pilotaży szkolnych.

## Szybki Podgląd

- Frontend: React + Vite
- Backend i dane: Firebase Authentication, Firestore, Storage, Hosting
- AI i automatyzacje: webhooki n8n oraz zewnętrzne usługi AI/STT
- Status: działający prototyp hackathonowy gotowy do demo

## Demo Live

- Aplikacja: https://eduflowapp.web.app
- Repozytorium: https://github.com/bujaakk/eduflow

## 60-sekundowy Scenariusz Prezentacji

1. Nauczyciel nagrywa podsumowanie lekcji albo dodaje PDF.
2. EduFlow przygotowuje materiał i zadania dla uczniów.
3. Uczeń wykonuje zadania i dostaje szybki feedback.
4. Nauczyciel widzi postępy klasy i wie, co powtórzyć.

## Najważniejsze Funkcje

### Panel nauczyciela

- zarządzanie klasami i uczniami,
- nagrywanie lekcji na desktopie,
- mobilne nagrywanie przez QR,
- akceptacja transkrypcji,
- podgląd postępów uczniów i statusów zadań.

### Panel ucznia

- lista przypisanych lekcji,
- quizy i zadania,
- szybki feedback po odpowiedzi,
- odblokowywane notatki i materiały,
- podgląd profilu i postępu.

### Panel administratora

- tworzenie środowisk,
- zarządzanie użytkownikami i rolami,
- przypisywanie nauczycieli i uczniów do klas.

### Obsługa wielu środowisk

Przykładowe ścieżki:

```text
/e/:environmentSlug/login
/e/:environmentSlug/teacher
/e/:environmentSlug/student
```

## Funkcje AI

EduFlow wykorzystuje integracje webhookowe (n8n i usługi zewnętrzne), dzięki czemu workflow AI można zmieniać bez przebudowy aplikacji.

- przetwarzanie audio lekcji i transkrypcji,
- generowanie zadań i quizów,
- automatyczne ocenianie odpowiedzi,
- workflow PDF -> materiał edukacyjny,
- onboarding i zapraszanie uczniów.

## Stack Technologiczny

Frontend:

- React 18
- Vite
- React Router
- React Hook Form
- React Markdown
- Lucide React

Backend i dane:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Hosting
- Firebase Cloud Functions

Integracje:

- webhooki n8n
- zewnętrzne AI/STT

## Uruchomienie Lokalnie

Wymagania:

- Node.js 18+
- npm

Instalacja i uruchomienie:

```bash
npm install
npm run dev
```

Build produkcyjny:

```bash
npm run build
npm run preview
```

## Konfiguracja Środowiska

Utwórz `.env` na podstawie `.env.example`.

```env
VITE_AUDIO_WEBHOOK_URL=https://n8n.yourwayai.pl/webhook/eduflow-audio
VITE_AUDIO_WEBHOOK_SECRET=eduflow-secret-2026
VITE_AUDIO_WEBHOOK_TIMEOUT_MS=45000
VITE_AMPLITUDE_API_KEY=your_amplitude_api_key
VITE_AMPLITUDE_DASHBOARD_URL=
VITE_AMPLITUDE_EMBED_URL=
VITE_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE=0
```

## Deploy

```bash
npm run build
firebase deploy --only hosting
```

## Roadmapa

- panel rodzica z widocznością postępów ucznia,
- aplikacja mobilna ucznia,
- integracje z dziennikami (Librus, Vulcan),
- głębsza analityka i rekomendacje,
- lepsza obserwowalność workflowów AI,
- testy end-to-end ścieżki nauczyciel -> uczeń.

## Dokumenty Projektowe

- [CHANGELOG](CHANGELOG.md)
- [CONTRIBUTING](CONTRIBUTING.md)
- [CODE_OF_CONDUCT](.github/CODE_OF_CONDUCT.md)
- [SECURITY](SECURITY.md)
- [LICENSE](LICENSE)

## Licencja

Ten projekt jest udostępniony na licencji MIT. Szczegóły w pliku [LICENSE](LICENSE).
