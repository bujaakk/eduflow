# EduFlow — Zadania: Mikołaj (AI & Automatyzacja — n8n + Claude API)

## Kontekst projektu
Budujesz całą warstwę AI i automatyzacji dla EduFlow.
Stack: n8n (self-hosted na yourwayai.pl), Claude API (claude-sonnet-4-20250514), Firebase Firestore.
Frontend (React) dostarcza Bujak. Ty dostarczasz webhooki i endpointy które on wywołuje.

---

## Endpointy do zbudowania (webhooki n8n)

Każdy workflow = osobny webhook. Udostępnij Bujakowi URL + przykładowy payload.

---

## 1. Przetwarzanie audio lekcji

**Trigger:** POST webhook — Bujak wysyła nagranie audio po lekcji nauczyciela

**Payload wejściowy:**
```json
{
  "audio": "<base64 lub multipart>",
  "teacherId": "uid123",
  "classId": "class456",
  "timestamp": "2026-05-22T10:00:00Z"
}
```

**Flow:**
- [ ] Przyjmij audio w n8n (Binary Data)
- [ ] Wyślij do Whisper API (OpenAI) → transkrypcja tekstu
- [ ] Wyślij transkrypcję do Claude → wyciągnij:
  - tytuł lekcji
  - kluczowe pojęcia (lista)
  - kluczowe daty i nazwiska
  - tematy które sprawiały trudność
- [ ] Claude generuje ustrukturyzowaną notatkę (nagłówki, bullet pointy, pogrubienia w markdown)
- [ ] Pobierz z Firestore listę uczniów klasy (`classes/{classId}.studentIds`)
- [ ] Dla każdego ucznia: pobierz `student_profiles/{studentId}` (historia błędów, słabe strony)
- [ ] Claude generuje spersonalizowany zestaw zadań per uczeń (3-5 pytań, trudniejsze na słabe strony)
- [ ] Zapis do Firestore:
  - `lessons/{lessonId}` — tytuł, transkrypcja, notatka, teacherId, classId, timestamp
  - `tasks/{taskId}` per uczeń — lessonId, studentId, questions[], status: "locked"

**Prompt Claude (notatka):**
```
Jesteś asystentem edukacyjnym. Na podstawie poniższej transkrypcji lekcji wygeneruj:
1. Tytuł lekcji (krótki, opisowy)
2. Kluczowe pojęcia (lista)
3. Kluczowe daty i nazwiska (lista)
4. Ustrukturyzowaną notatkę w markdown (nagłówki H2/H3, bullet pointy, kluczowe pojęcia **pogrubione**)

Transkrypcja:
{transkrypcja}
```

**Prompt Claude (zadania per uczeń):**
```
Jesteś nauczycielem. Wygeneruj 4 pytania sprawdzające do lekcji dla ucznia.
Pytania powinny być trudniejsze w obszarach gdzie uczeń ma słabe strony.

Materiał lekcji:
{notatka}

Słabe strony ucznia:
{student_profiles.weaknesses}

Historia błędów:
{student_profiles.errorHistory}

Zwróć TYLKO JSON:
{"questions": ["pytanie1", "pytanie2", "pytanie3", "pytanie4"]}
```

---

## 2. Ocenianie odpowiedzi ucznia

**Trigger:** POST webhook — Bujak wysyła odpowiedź ucznia na pytanie

**Payload wejściowy:**
```json
{
  "studentId": "uid789",
  "taskId": "task123",
  "lessonId": "lesson456",
  "questionIndex": 0,
  "question": "Jakie były główne przyczyny...",
  "answer": "Odpowiedź ucznia tutaj"
}
```

**Flow:**
- [ ] Pobierz notatkę lekcji z Firestore (`lessons/{lessonId}.note`)
- [ ] Wyślij do Claude: pytanie + odpowiedź + kontekst notatki
- [ ] Claude zwraca: ocena (pass/fail), feedback (1-2 zdania), wykryte błędy/luki
- [ ] Zapisz do Firestore:
  - `answers/{answerId}` — taskId, studentId, content, aiScore, feedback, timestamp
  - Zaktualizuj `student_profiles/{studentId}.errorHistory` — dodaj wykryte luki
- [ ] Sprawdź czy uczeń zaliczył wszystkie pytania w tasie → jeśli tak: zmień `tasks/{taskId}.status` na `done`
- [ ] Jeśli `done`: zaktualizuj `student_profiles/{studentId}.lessonsCompleted`
- [ ] Zwróć do Bujaka: `{score, feedback, taskCompleted: true/false}`

**Prompt Claude:**
```
Jesteś nauczycielem oceniającym odpowiedź ucznia.

Pytanie: {question}
Odpowiedź ucznia: {answer}
Materiał źródłowy: {lessonNote}

Oceń odpowiedź i zwróć TYLKO JSON:
{
  "pass": true/false,
  "feedback": "1-2 zdania feedbacku dla ucznia, wskazówka jeśli błąd",
  "gaps": ["luka1", "luka2"]
}

Feedback pisz po polsku, bezpośrednio do ucznia. Bądź konstruktywny.
```

---

## 3. Mini-chatbot przy notatce

**Trigger:** POST webhook — uczeń zadaje pytanie do materiału lekcji

**Payload wejściowy:**
```json
{
  "studentId": "uid789",
  "lessonId": "lesson456",
  "question": "Pytanie ucznia",
  "history": [
    {"role": "user", "content": "poprzednie pytanie"},
    {"role": "assistant", "content": "poprzednia odpowiedź"}
  ]
}
```

**Flow:**
- [ ] Pobierz notatkę lekcji z Firestore (`lessons/{lessonId}.note`)
- [ ] Wyślij do Claude API z system promptem + historią konwersacji + nowym pytaniem
- [ ] Zwróć odpowiedź do Bujaka

**System prompt:**
```
Jesteś pomocnym asystentem edukacyjnym dla ucznia. Odpowiadasz TYLKO na pytania dotyczące materiału z poniższej notatki lekcji. Jeśli pytanie jest poza zakresem notatki, powiedz że nie możesz pomóc w tym temacie. Odpowiadaj po polsku, zwięźle i jasno.

Notatka lekcji:
{lessonNote}
```

---

## 4. Wysyłka kodu zaproszenia dla ucznia

**Trigger:** Firestore trigger — nowy dokument w kolekcji `invitations`

**Flow:**
- [ ] n8n nasłuchuje na nowe dokumenty w `invitations` (polling co 30s lub webhook z Firestore)
- [ ] Pobierz: email ucznia, kod 6-cyfrowy (wygeneruj losowo jeśli brak), classId
- [ ] Wyślij email na adres ucznia przez SMTP (lh.pl):
  - Temat: „Zaproszenie do EduFlow"
  - Treść: imię nauczyciela, nazwa klasy, **kod 6-cyfrowy**, link do strony logowania
- [ ] Zaktualizuj `invitations/{id}.sentAt` = timestamp

**Dane SMTP:** lh.pl, kontakt@yourwayai.pl (lub skonfiguruj osobne konto EduFlow)

---

## 5. Raport poranny dla nauczyciela (7:00)

**Trigger:** Scheduled — codziennie o 7:00

**Flow:**
- [ ] Pobierz wszystkich nauczycieli z Firestore (`users` gdzie `role == "teacher"`)
- [ ] Dla każdego nauczyciela: pobierz jego klasy i uczniów
- [ ] Zbierz dane z ostatnich 24h: odpowiedzi uczniów, zaliczenia, aktywność
- [ ] Claude generuje podsumowanie w naturalnym języku:
  - Ilu uczniów było aktywnych
  - Jakie lekcje zostały zaliczone
  - Które pojęcia dominowały jako błędy w klasie
  - 1-2 rekomendacje na dziś
- [ ] Wyślij email do nauczyciela przez SMTP

---

## Aktualizacja profilu ucznia (AI analiza słabych stron)

- [ ] Po każdych 3+ zaliczonych lekcjach: uruchom analizę Claude na historii błędów ucznia
- [ ] Claude generuje: listę słabych stron + krótką rekomendację dla nauczyciela
- [ ] Zapisz do `student_profiles/{studentId}`:
  - `weaknesses: ["pojęcie1", "pojęcie2"]`
  - `aiRecommendation: "Kasia nie rozumie..."`

---

## Techniczne

- [ ] Wszystkie webhooki zabezpiecz secret headerem (Bujak doda `X-EduFlow-Secret` do requestów)
- [ ] Logowanie błędów w n8n — każdy workflow ma node Error Trigger → log do Firestore lub Slack
- [ ] Testuj każdy endpoint osobno przed integracją z Bujakiem
- [ ] Udostępnij Bujakowi dokumentację endpointów: URL + metoda + przykładowy payload + przykładowa odpowiedź

---

## Priorytety MVP (hackathon)

**Must have (w tej kolejności):**
1. Przetwarzanie audio → notatka + zadania w Firestore
2. Ocenianie odpowiedzi + feedback + zmiana statusu taska
3. Wysyłka kodu zaproszenia emailem

**Nice-to-have:**
- Mini-chatbot przy notatce
- Raport poranny 7:00
- Analiza słabych stron ucznia
