# EduFlow — Zadania: Bujak (Frontend React + Firebase)

## Kontekst projektu
Budujesz frontend aplikacji edukacyjnej EduFlow w React + Firebase.
Stack: React, Firebase Auth, Firebase Firestore, Firebase Hosting.
Backend/AI obsługuje Mikołaj przez n8n + Claude API.
Design dostarcza Eryk z Figmy.

---

## Setup projektu

- [x] Zainicjuj projekt React (Vite lub CRA)
- [x] Skonfiguruj Firebase (Auth, Firestore, Hosting) — dodaj `firebase.js` z config
- [x] Zainstaluj zależności: `firebase`, `react-router-dom`, `react-hook-form`
- [x] Skonfiguruj routing (React Router): `/login`, `/teacher/*`, `/student/*`
- [x] Deploy testowy na Firebase Hosting — https://eduflow-5a0d4.web.app

---

## Logowanie i Auth

- [x] Ekran logowania — auto-detekcja roli po zalogowaniu (bez wyboru ręcznego)
- [x] Nauczyciel: rejestracja + logowanie email + hasło (Firebase Auth)
- [x] Uczeń: logowanie email + 6-cyfrowy kod z maila
  - [x] Pobierz dokument z kolekcji `invitations` gdzie `email` + `code` pasują
  - [x] Jeśli `status: pending` → utwórz konto Firebase Auth dla ucznia → zmień status na `used`
  - [x] Przekieruj ucznia do jego panelu
- [x] Obsługa błędów: zły kod, wygasłe zaproszenie, zajęty email
- [x] Guard routingu: niezalogowany użytkownik → redirect do `/login`
- [x] Guard roli: nauczyciel nie wchodzi do panelu ucznia i odwrotnie

---

## Panel Nauczyciela

### Strona główna
- [x] Powitanie z imieniem i nazwiskiem nauczyciela
- [x] Lista jego klas (nazwa, przedmiot) — pobierana z Firestore (`classes` gdzie `teacherId == uid`)
- [x] Skróty statystyk: liczba przeprowadzonych lekcji, liczba aktywnych uczniów

### Zarządzanie klasą
- [x] Widok klasy: lista uczniów (imię, email, data dołączenia, status aktywności)
- [x] Przycisk „Dodaj ucznia" → modal z polem email → zapis do kolekcji `invitations` (Mikołaj odbiera trigger i wysyła kod)
- [x] Przycisk „Usuń ucznia" z potwierdzeniem → usuń ucznia z `classes.studentIds`

### Profil ucznia (widok nauczyciela)
- [x] Kliknięcie na ucznia → osobny widok z jego profilem
- [x] Imię, email, klasa
- [x] Postępy ogólne: ile lekcji zaliczonych / ile dostępnych
- [x] Historia zadań: tabela (lekcja, wynik, liczba prób, czy odblokował notatkę)
- [x] Słabe strony: lista tagów/pojęć z `student_profiles`
- [x] Rekomendacja AI: pole tekstowe z `student_profiles.aiRecommendation`

### Lista lekcji
- [x] Lista wszystkich lekcji nauczyciela (tytuł, data, ile uczniów zaliczonych)
- [x] Kliknięcie na lekcję → podgląd: kto zaliczył, kto nie (rozwijana lista uczniów)

### Nagrywanie lekcji
- [x] Ekran nagrywania audio (max 3 minuty) — MediaRecorder API
- [x] Podczas nagrywania wyświetl 4 prompty pomocnicze
- [x] Po nagraniu: wyślij plik audio jako `multipart/form-data` do webhooka n8n Mikołaja
- [x] Dodaj `teacherId`, `classId`, `timestamp` do requesta
- [x] Pokaż stan: nagrywanie → wysyłanie → sukces/błąd

---

## Panel Ucznia

### Strona główna
- [x] Imię ucznia, nazwa klasy (np. „Klasa 3A")
- [x] Lista przypisanych nauczycieli (imię, przedmiot)
- [x] Podsumowanie: ile lekcji zaliczonych, ile czeka

### Lista lekcji
- [x] Karty lekcji: tytuł, data, przedmiot, nauczyciel
- [x] Status karty widoczny wizualnie: 🔒 / ⏳ / ✅
- [x] Real-time listener Firestore na kolekcji `tasks` ucznia

### Widok lekcji — zadania
- [x] Lista pytań sprawdzających (pobrana z `tasks`)
- [x] Pole tekstowe na odpowiedź + przycisk „Wyślij"
- [x] Po wysłaniu: wywołaj endpoint n8n Mikołaja → wyświetl feedback AI
- [x] Blokada: nie można przejść dalej bez odpowiedzi na poprzednie pytanie

### Odblokowanie notatki
- [x] Po zaliczeniu wszystkich zadań: animacja odblokowania 🔓
- [x] Wyświetl notatkę AI: nagłówki, bullet pointy, pogrubione pojęcia
- [x] Mini-chatbot przy notatce: pole input → wywołanie endpointu n8n → odpowiedź AI
- [x] Chatbot zachowuje historię wiadomości w sesji

### Mój profil
- [x] Klasa, lista nauczycieli
- [x] Wykres postępów — mini słupki CSS per lekcja + pasek ogólny
- [x] Słabe strony: lista pojęć z `student_profiles`

---

## Firestore — struktura kolekcji (do implementacji)

```
users/          {uid, name, email, role: "teacher"|"student"}
classes/        {name, subject, teacherId, studentIds: []}
invitations/    {email, code, classId, status: "pending"|"used"}
lessons/        {title, transcript, note, teacherId, classId, timestamp}
tasks/          {lessonId, studentId, questions: [], status: "locked"|"in_progress"|"done"}
answers/        {taskId, studentId, content, aiScore, feedback, timestamp}
student_profiles/ {studentId, weaknesses: [], aiRecommendation, lessonsCompleted}
```

---

## Real-time i UX

- [x] Firestore `onSnapshot` na dashboardzie ucznia — dane na żywo bez odświeżania
- [x] Loading state na każdym fetch z Firestore
- [ ] Error boundary globalny — nie crashuj całej apki przy błędzie komponentu _(nie zrobione)_
- [ ] Toast notyfikacje (sukces/błąd) przy kluczowych akcjach _(nie zrobione)_

---

## Deploy

- [x] `firebase.json` skonfigurowany pod React SPA (redirect wszystkiego na `index.html`)
- [ ] Environment variables: Firebase config w `.env` (nie commituj do repo) _(config hardkodowany — wystarczy na hackathon)_
- [x] Przetestuj deploy na Firebase Hosting przed demo → https://eduflow-app.web.app

---

## Priorytety MVP (hackathon)

**Must have:**
1. [x] Logowanie nauczyciela i ucznia (z kodem z maila)
2. [x] Dodawanie ucznia → zapis do `invitations` z wygenerowanym kodem
3. [x] Nagrywanie audio → wysyłka do n8n
4. [x] Panel ucznia: lista lekcji z statusami
5. [x] Widok zadań + wysyłka odpowiedzi do n8n
6. [x] Odblokowanie notatki po zaliczeniu
7. [x] Nauczyciel widzi kto zaliczył

**Nice-to-have:**
- [x] Profil ucznia z historią błędów
- [x] Mini-chatbot przy notatce
- [x] Wykresy postępów (mini bar chart per lekcja)
- [ ] Raport poranny _(Mikołaj)_

---

## Dodatkowe rzeczy zrobione ponad spec

- [x] **Panel admina** `/admin` (hasło: `hackaton`) — CRUD nauczycielami i klasami, tworzenie kont bez wylogowania
- [x] **Design system Eryka** — tokeny CSS (kolory, cienie, radius), Inter + Sora z Google Fonts, komponent `<Logo>`
- [x] **Visual pass UI** — hero panel, karty z cieniem, badge statusów, lucide-react ikony, responsywność, redesign Login (split layout z panelem brandowym)
- [x] **Ustawienie hasła ucznia** — po pierwszym logowaniu kodem uczeń ustawia własne hasło; przy kolejnych loguje się normalnie e-mail + hasło
- [x] **Bugfix: kod zaproszenia** — `ClassView` generuje 6-cyfrowy kod i wyświetla go nauczycielowi; wcześniej kod nie był zapisywany do Firestore
- [x] **Bugfix: uczeń w klasie** — po rejestracji kodem uczeń jest automatycznie dodawany do `classes.studentIds` (`arrayUnion`)
- [x] **Bugfix: logo** — pliki były PNG z rozszerzeniem `.svg`; zmieniono na `.png` + fallback tekstowy w komponencie
