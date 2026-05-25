# Contributing to EduFlow

Dziękujemy za chęć współtworzenia projektu.

## Zasady ogólne

- Najpierw utwórz issue lub wybierz istniejące.
- Pracuj na własnej gałęzi (`feature/...`, `fix/...`, `chore/...`).
- Twórz małe, czytelne commity z opisem biznesowym zmiany.
- Przed PR upewnij się, że projekt się buduje.

## Setup lokalny

```bash
npm install
npm run dev
```

## Weryfikacja przed PR

```bash
npm run build
```

## Pull Request checklist

- Opisuje problem i rozwiązanie.
- Zawiera kroki testowe.
- Nie zawiera sekretów i danych wrażliwych.
- Aktualizuje README lub CHANGELOG, jeśli to potrzebne.

## Standard commit messages

- `feat:` nowa funkcja
- `fix:` poprawka błędu
- `docs:` dokumentacja
- `chore:` porządki techniczne
- `refactor:` przebudowa bez zmiany zachowania

Dla większych zmian produktowych dodaj krótki kontekst: „dlaczego ta zmiana jest ważna dla nauczyciela/ucznia”.
