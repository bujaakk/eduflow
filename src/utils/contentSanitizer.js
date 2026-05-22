const ARTIFACT_LINE_PATTERNS = [
  /^\s*napisy stworzone przez spolecznosc amara\.org\s*$/gim,
  /^\s*napisy stworzone przez społeczność amara\.org\s*$/gim,
  /^\s*subtitles by the amara\.org community\s*$/gim,
  /^\s*.*amara\.org.*\s*$/gim,
]

export function sanitizeGeneratedText(value) {
  if (typeof value !== 'string') return ''

  let output = value.replace(/\r/g, '')
  for (const pattern of ARTIFACT_LINE_PATTERNS) {
    output = output.replace(pattern, '')
  }

  // Keep paragraph spacing readable after removing noisy lines.
  output = output.replace(/\n{3,}/g, '\n\n').trim()
  return output
}
