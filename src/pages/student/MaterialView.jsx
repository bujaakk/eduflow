import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'
import { sanitizeGeneratedText } from '../../utils/contentSanitizer'

const pickString = (...values) => {
  const hit = values.find((value) => typeof value === 'string' && value.trim())
  return sanitizeGeneratedText(hit ? hit.trim() : '')
}

const parseMaybeJson = (value) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

const toArray = (...values) => {
  for (const value of values) {
    const parsed = parseMaybeJson(value)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed
  }
  return []
}

const readText = (item, ...keys) => {
  if (typeof item === 'string') return sanitizeGeneratedText(item)
  if (!item || typeof item !== 'object') return ''
  const key = keys.find((candidate) => typeof item[candidate] === 'string' && item[candidate].trim())
  return key ? sanitizeGeneratedText(item[key]) : ''
}

const normalizeSections = (material) => toArray(
  material.sections,
  material.blocks,
  material.contentSections,
  material.generated?.sections,
  material.data?.sections
).map((item, index) => {
  const parsed = parseMaybeJson(item)
  return {
    title: readText(parsed, 'title', 'heading', 'name') || `Część ${index + 1}`,
    body: readText(parsed, 'body', 'content', 'text', 'summary', 'description'),
    bullets: toArray(parsed?.bullets, parsed?.points, parsed?.keyPoints).map((point) => readText(point, 'text', 'point', 'content')).filter(Boolean),
  }
}).filter((section) => section.title || section.body || section.bullets.length > 0)

const normalizeTerms = (material) => toArray(
  material.importantTerms,
  material.keyTerms,
  material.glossary,
  material.generated?.importantTerms,
  material.data?.importantTerms
).map((item) => {
  const parsed = parseMaybeJson(item)
  return {
    term: readText(parsed, 'term', 'name', 'title', 'pojecie') || readText(parsed),
    definition: readText(parsed, 'definition', 'description', 'explanation', 'wyjasnienie'),
  }
}).filter((item) => item.term)

const normalizeQuestions = (material) => toArray(
  material.recapQuestions,
  material.reviewQuestions,
  material.questions,
  material.generated?.recapQuestions,
  material.data?.recapQuestions
).map((item) => {
  const parsed = parseMaybeJson(item)
  return {
    question: readText(parsed, 'question', 'prompt', 'text', 'pytanie') || readText(parsed),
    answer: readText(parsed, 'answer', 'suggestedAnswer', 'hint', 'odpowiedz'),
  }
}).filter((item) => item.question)

const normalizeStringList = (...values) => toArray(...values)
  .map((item) => readText(parseMaybeJson(item), 'text', 'point', 'content', 'title') || readText(item))
  .filter(Boolean)

const markdownComponents = {
  h1: ({ children }) => <h1 style={s.mdH1}>{children}</h1>,
  h2: ({ children }) => <h2 style={s.mdH2}>{children}</h2>,
  h3: ({ children }) => <h3 style={s.mdH3}>{children}</h3>,
  p: ({ children }) => <p style={s.mdP}>{children}</p>,
  ul: ({ children }) => <ul style={s.mdList}>{children}</ul>,
  ol: ({ children }) => <ol style={s.mdList}>{children}</ol>,
  li: ({ children }) => <li style={s.mdLi}>{children}</li>,
  strong: ({ children }) => <strong style={s.mdStrong}>{children}</strong>,
}

export default function MaterialView() {
  const { materialId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [material, setMaterial] = useState(null)
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const fetchMaterial = async () => {
      if (!user?.uid || !materialId) return
      const studentSnap = await getDoc(doc(db, 'students', user.uid))
      const materialSnap = await getDoc(doc(db, 'materials', materialId))

      if (!studentSnap.exists() || !materialSnap.exists()) {
        setLoading(false)
        return
      }

      const student = studentSnap.data()
      const row = { id: materialSnap.id, ...materialSnap.data() }
      const classIds = Array.isArray(student.classIds) ? student.classIds : [student.classId].filter(Boolean)
      setAllowed(classIds.includes(row.classId))
      setMaterial(row)
      setLoading(false)
    }

    fetchMaterial()
  }, [materialId, user?.uid])

  if (loading) return <div style={s.page}><p style={s.hint}>Ładowanie materiału...</p></div>
  if (!material || !allowed) {
    return (
      <div style={s.page}>
        <main style={s.main}>
          <div className="ui-card">
            <IllustrationState type="error" title="Nie znaleziono materiału" text="Materiał nie istnieje albo nie należy do Twojej klasy." />
          </div>
        </main>
      </div>
    )
  }

  const noteText = pickString(
    material.note,
    material.notes,
    material.materialNote,
    material.generatedNote,
    material.summary,
    material.generated?.note,
    material.data?.note
  )
  const sections = normalizeSections(material)
  const keyPoints = normalizeStringList(material.keyPoints, material.takeaways, material.highlights, material.generated?.keyPoints, material.data?.keyPoints)
  const importantTerms = normalizeTerms(material)
  const recapQuestions = normalizeQuestions(material)
  const hasRichMaterial = sections.length > 0 || keyPoints.length > 0 || importantTerms.length > 0 || recapQuestions.length > 0
  const isProcessing = material.processingStatus === 'processing' || material.status === 'processing' || (!noteText && !hasRichMaterial)

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/student')}>← Wróć</button>
        <Logo height={26} />
        <span style={s.badge}>Materiały</span>
      </header>

      <main style={s.main}>
        <section style={s.heroCard}>
          <p style={s.eyebrow}>Materiał dodatkowy</p>
          <h1 style={s.title}>{material.title || material.shortTitle || 'Materiał dodatkowy'}</h1>
          <p style={s.subtitle}>{material.description || material.fileName || material.sourceName || 'PDF opracowany przez AI'}</p>
          {!isProcessing && (
            <div style={s.heroMetaGrid}>
              <span style={s.heroMetaItem}>{sections.length || 1} części</span>
              <span style={s.heroMetaItem}>{importantTerms.length} pojęć</span>
              <span style={s.heroMetaItem}>{recapQuestions.length} pytań</span>
            </div>
          )}
        </section>

        {isProcessing ? (
          <section style={s.noteCard}>
            <IllustrationState
              type="noTasks"
              title="AI przygotowuje materiał"
              text="Notatka pojawi się tutaj automatycznie, gdy n8n zakończy analizę PDF i zapisze wynik w Firestore."
            />
          </section>
        ) : hasRichMaterial ? (
          <div style={s.richLayout}>
            {keyPoints.length > 0 && (
              <section style={s.quickCard}>
                <p style={s.sectionEyebrow}>Najpierw przeczytaj</p>
                <h2 style={s.sectionTitle}>Co jest najważniejsze?</h2>
                <div style={s.keyPointGrid}>
                  {keyPoints.map((point, index) => (
                    <article key={`point-${index}`} style={s.keyPointCard}>
                      <span style={s.pointNumber}>{index + 1}</span>
                      <p style={s.pointText}>{point}</p>
                    </article>
                  ))}
                </div>
              </section>
            )}

            {sections.length > 0 && (
              <section style={s.noteCard}>
                <p style={s.sectionEyebrow}>Materiał</p>
                <h2 style={s.sectionTitle}>Czytaj krok po kroku</h2>
                <div style={s.sectionStack}>
                  {sections.map((section, index) => (
                    <details key={`section-${index}`} style={s.detailCard} open={index === 0}>
                      <summary style={s.detailSummary}>{section.title}</summary>
                      {section.body && <p style={s.richParagraph}>{section.body}</p>}
                      {section.bullets.length > 0 && (
                        <ul style={s.richList}>
                          {section.bullets.map((point, pointIndex) => <li key={`section-${index}-point-${pointIndex}`}>{point}</li>)}
                        </ul>
                      )}
                    </details>
                  ))}
                </div>
              </section>
            )}

            {importantTerms.length > 0 && (
              <section style={s.quickCard}>
                <p style={s.sectionEyebrow}>Pojęcia</p>
                <h2 style={s.sectionTitle}>Warto zapamiętać</h2>
                <div style={s.termGrid}>
                  {importantTerms.map((item, index) => (
                    <article key={`term-${index}`} style={s.termCard}>
                      <h3 style={s.termTitle}>{item.term}</h3>
                      {item.definition && <p style={s.termDefinition}>{item.definition}</p>}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {recapQuestions.length > 0 && (
              <section style={s.noteCard}>
                <p style={s.sectionEyebrow}>Powtórka</p>
                <h2 style={s.sectionTitle}>Sprawdź, czy rozumiesz</h2>
                <div style={s.sectionStack}>
                  {recapQuestions.map((item, index) => (
                    <details key={`question-${index}`} style={s.questionCard}>
                      <summary style={s.detailSummary}>{item.question}</summary>
                      <p style={s.richParagraph}>{item.answer || 'Spróbuj odpowiedzieć własnymi słowami, a potem wróć do materiału i porównaj.'}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}

            {noteText && (
              <section style={s.noteCard}>
                <p style={s.sectionEyebrow}>Pełna wersja</p>
                <ReactMarkdown components={markdownComponents}>{noteText}</ReactMarkdown>
              </section>
            )}
          </div>
        ) : (
          <section style={s.noteCard}>
            <ReactMarkdown components={markdownComponents}>{noteText}</ReactMarkdown>
          </section>
        )}
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  badge: { background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', borderRadius: 999, padding: '7px 12px', fontSize: 12, fontWeight: 800 },
  main: { width: 'min(900px, calc(100% - 32px))', margin: '0 auto', padding: '30px 0 58px' },
  hint: { padding: 24, color: '#64748b' },
  heroCard: { padding: '26px 28px', borderRadius: 24, color: '#fff', background: 'linear-gradient(135deg, #0f766e, #2563eb)', boxShadow: '0 22px 50px rgba(37,99,235,.20)', marginBottom: 16 },
  eyebrow: { margin: 0, fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.76)', fontWeight: 800 },
  title: { margin: '9px 0 8px', fontSize: 'clamp(30px, 5vw, 46px)', lineHeight: 1.06, fontWeight: 850 },
  subtitle: { margin: 0, color: 'rgba(255,255,255,.86)', fontSize: 16, lineHeight: 1.72, maxWidth: 760 },
  heroMetaGrid: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 18 },
  heroMetaItem: { border: '1px solid rgba(255,255,255,.28)', background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: '7px 11px', fontSize: 12, fontWeight: 800 },
  richLayout: { display: 'grid', gap: 16 },
  noteCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 'clamp(22px, 4vw, 38px)', boxShadow: '0 16px 44px rgba(15,23,42,.08)' },
  quickCard: { background: '#f8fafc', border: '1px solid #dbeafe', borderRadius: 20, padding: 'clamp(20px, 4vw, 30px)', boxShadow: '0 12px 34px rgba(15,23,42,.06)' },
  sectionEyebrow: { margin: '0 0 8px', color: '#2563eb', fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 850 },
  sectionTitle: { margin: '0 0 16px', color: '#0f172a', fontSize: 24, lineHeight: 1.18, fontWeight: 850 },
  keyPointGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 },
  keyPointCard: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 12, alignItems: 'start', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 },
  pointNumber: { width: 30, height: 30, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#dbeafe', color: '#1d4ed8', fontSize: 13, fontWeight: 900 },
  pointText: { margin: 0, color: '#334155', fontSize: 14, lineHeight: 1.58 },
  sectionStack: { display: 'grid', gap: 10 },
  detailCard: { border: '1px solid #e2e8f0', borderRadius: 16, padding: '14px 16px', background: '#ffffff' },
  detailSummary: { cursor: 'pointer', color: '#0f172a', fontWeight: 850, fontSize: 16, lineHeight: 1.35 },
  richParagraph: { margin: '12px 0 0', color: '#334155', fontSize: 15, lineHeight: 1.75 },
  richList: { margin: '12px 0 0', paddingLeft: 22, color: '#334155', display: 'grid', gap: 7, lineHeight: 1.65 },
  termGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 },
  termCard: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 },
  termTitle: { margin: '0 0 8px', color: '#0f172a', fontSize: 16, fontWeight: 850 },
  termDefinition: { margin: 0, color: '#475569', fontSize: 14, lineHeight: 1.62 },
  questionCard: { border: '1px solid #bfdbfe', borderRadius: 16, padding: '14px 16px', background: '#eff6ff' },
  mdH1: { margin: '0 0 18px', color: '#0f172a', fontSize: 32, lineHeight: 1.12, fontWeight: 850 },
  mdH2: { margin: '26px 0 10px', color: '#0f172a', fontSize: 24, lineHeight: 1.18, fontWeight: 850 },
  mdH3: { margin: '20px 0 8px', color: '#1e3a8a', fontSize: 18, fontWeight: 800 },
  mdP: { margin: '0 0 14px', color: '#334155', fontSize: 16, lineHeight: 1.78 },
  mdList: { margin: '0 0 16px', paddingLeft: 24, display: 'grid', gap: 8, color: '#334155', lineHeight: 1.7 },
  mdLi: { paddingLeft: 4 },
  mdStrong: { color: '#0f172a', fontWeight: 850 },
}