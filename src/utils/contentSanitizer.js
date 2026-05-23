const ARTIFACT_LINE_PATTERNS = [
  /^\s*napisy stworzone przez spolecznosc amara\.org\s*$/gim,
  /^\s*napisy stworzone przez społeczność amara\.org\s*$/gim,
  /^\s*subtitles by the amara\.org community\s*$/gim,
  /^\s*.*amara\.org.*\s*$/gim,
]

const POLISH_WORD_FIXES = [
  ['bezpieczenstwo', 'bezpieczeństwo'],
  ['bezpieczny', 'bezpieczny'],
  ['cwiczenia', 'ćwiczenia'],
  ['cwiczenie', 'ćwiczenie'],
  ['cwiczen', 'ćwiczeń'],
  ['czesc', 'część'],
  ['dzieki', 'dzięki'],
  ['glowny', 'główny'],
  ['glowne', 'główne'],
  ['glowna', 'główna'],
  ['haslo', 'hasło'],
  ['hasla', 'hasła'],
  ['jesli', 'jeśli'],
  ['ktora', 'która'],
  ['ktore', 'które'],
  ['ktory', 'który'],
  ['latwo', 'łatwo'],
  ['material', 'materiał'],
  ['materialu', 'materiału'],
  ['materialy', 'materiały'],
  ['mozna', 'można'],
  ['moze', 'może'],
  ['najwazniejsze', 'najważniejsze'],
  ['nastepnie', 'następnie'],
  ['nastepny', 'następny'],
  ['odpowiedz', 'odpowiedź'],
  ['odpowiedzi', 'odpowiedzi'],
  ['pojecia', 'pojęcia'],
  ['pojecie', 'pojęcie'],
  ['poniewaz', 'ponieważ'],
  ['rowniez', 'również'],
  ['roznica', 'różnica'],
  ['rozne', 'różne'],
  ['rozumiec', 'rozumieć'],
  ['spolecznosc', 'społeczność'],
  ['sprawdz', 'sprawdź'],
  ['sprobuj', 'spróbuj'],
  ['uczen', 'uczeń'],
  ['ucznia', 'ucznia'],
  ['uczniow', 'uczniów'],
  ['uzyj', 'użyj'],
  ['uzytkownik', 'użytkownik'],
  ['wazna', 'ważna'],
  ['wazne', 'ważne'],
  ['wazny', 'ważny'],
  ['wiecej', 'więcej'],
  ['wlasne', 'własne'],
  ['wlasny', 'własny'],
  ['wyjasnia', 'wyjaśnia'],
  ['wyjasnienie', 'wyjaśnienie'],
  ['zrodlo', 'źródło'],
]

function matchCase(source, replacement) {
  if (source.toUpperCase() === source) return replacement.toUpperCase()
  if (source[0]?.toUpperCase() === source[0]) return replacement[0].toUpperCase() + replacement.slice(1)
  return replacement
}

function restorePolishCharacters(value) {
  return POLISH_WORD_FIXES.reduce((text, [source, replacement]) => {
    const pattern = new RegExp(`\\b${source}\\b`, 'gi')
    return text.replace(pattern, (match) => matchCase(match, replacement))
  }, value)
}

function normalizePunctuation(value) {
  return value
    .split('\n')
    .map((line) => {
      if (/https?:\/\//i.test(line)) return line
      const fixedSpacing = line
        .replace(/\s+([,.!?;:])/g, '$1')
        .replace(/([,.!?;:])([^\s\]\)"'`*_])/g, '$1 $2')
      const trimmed = fixedSpacing.trim()
      if (!trimmed || /^[#>*\-\d]+[.)\s]/.test(trimmed) || /[.!?:;\]})]$/.test(trimmed) || trimmed.length < 28) return fixedSpacing
      return `${fixedSpacing}.`
    })
    .join('\n')
}

export function sanitizeGeneratedText(value) {
  if (typeof value !== 'string') return ''

  let output = value.replace(/\r/g, '')
  for (const pattern of ARTIFACT_LINE_PATTERNS) {
    output = output.replace(pattern, '')
  }

  // Keep paragraph spacing readable after removing noisy lines.
  output = restorePolishCharacters(output)
  output = normalizePunctuation(output)
  output = output.replace(/\n{3,}/g, '\n\n').trim()
  return output
}
