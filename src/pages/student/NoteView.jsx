import Logo from '../../components/Logo'
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'
import { sanitizeGeneratedText } from '../../utils/contentSanitizer'

const pickString = (...values) => {
  const hit = values.find((v) => typeof v === 'string' && v.trim())
  return sanitizeGeneratedText(hit ? hit.trim() : '')
}

const pickArray = (...values) => {
  const hit = values.find((v) => Array.isArray(v) && v.length > 0)
  return hit || []
}

const pickExerciseSource = (...values) => values.find((value) => {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') {
    return ['flashcards', 'fiszki', 'quickCheck', 'quiz', 'openTasks', 'tasks'].some((key) => Array.isArray(value[key]) && value[key].length > 0)
  }
  return false
})

const readText = (item, ...keys) => {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return ''
  const hit = keys.find((key) => typeof item[key] === 'string' && item[key].trim())
  return hit ? item[hit].trim() : ''
}

const normalizeExerciseSet = (source) => {
  const set = { flashcards: [], quickCheck: [], openTasks: [] }
  const addFlashcard = (item) => {
    const front = readText(item, 'front', 'term', 'question', 'pytanie', 'pojecie')
    const back = readText(item, 'back', 'answer', 'definition', 'odpowiedz', 'wyjasnienie')
    if (front && back) set.flashcards.push({ front, back })
  }
  const addQuickCheck = (item) => {
    const question = readText(item, 'question', 'prompt', 'pytanie')
    const answer = readText(item, 'answer', 'odpowiedz', 'expectedAnswer')
    if (question) set.quickCheck.push({ question, answer })
  }
  const addOpenTask = (item) => {
    const prompt = readText(item, 'prompt', 'task', 'instruction', 'polecenie', 'question')
    const hint = readText(item, 'hint', 'wskazowka', 'tip')
    if (prompt) set.openTasks.push({ prompt, hint })
  }

  if (Array.isArray(source)) {
    source.forEach((item) => {
      if (typeof item === 'string') {
        addOpenTask(item)
        return
      }
      const type = String(item?.type || item?.mode || '').toLowerCase()
      if (type.includes('flash') || type.includes('fisz')) addFlashcard(item)
      else if (type.includes('quick') || type.includes('quiz') || type.includes('check')) addQuickCheck(item)
      else addOpenTask(item)
    })
    return set
  }

  if (source && typeof source === 'object') {
    ;[...(source.flashcards || []), ...(source.fiszki || [])].forEach(addFlashcard)
    ;[...(source.quickCheck || []), ...(source.quiz || [])].forEach(addQuickCheck)
    ;[...(source.openTasks || []), ...(source.tasks || [])].forEach(addOpenTask)
  }

  return set
}

const N8N_CHAT_URL = 'WSTAW_URL_WEBHOOKA_MIKOLAJA_CHATBOT'

export default function NoteView() {
  const { taskId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const shouldPlayUnlock = Boolean(location.state?.justUnlocked)

  const [lesson, setLesson] = useState(null)
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showUnlockIntro, setShowUnlockIntro] = useState(shouldPlayUnlock)
  const [contentReady, setContentReady] = useState(!shouldPlayUnlock)
  const [noteAllowed, setNoteAllowed] = useState(false)

  // Chatbot
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'Cześć! Mogę odpowiedzieć na pytania dotyczące tej lekcji. O co chcesz zapytać?' }
  ])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef(null)

  useEffect(() => {
    const fetch = async () => {
      const taskSnap = await getDoc(doc(db, 'tasks', taskId))
      if (!taskSnap.exists()) return
      const taskData = taskSnap.data()
      setTask({ id: taskSnap.id, ...taskData })

      const canOpenNote = taskData.noteUnlocked === true || taskData.quizStatus === 'completed' || taskData.status === 'done'
      setNoteAllowed(canOpenNote)
      if (!canOpenNote) {
        setLoading(false)
        return
      }

      const lessonSnap = await getDoc(doc(db, 'lessons', taskData.lessonId))
      if (lessonSnap.exists()) setLesson({ id: lessonSnap.id, ...lessonSnap.data() })
      setLoading(false)
    }
    fetch()
  }, [taskId])

  useEffect(() => {
    if (!showUnlockIntro) return undefined
    const timer = setTimeout(() => {
      setShowUnlockIntro(false)
      setContentReady(true)
    }, 1900)
    return () => clearTimeout(timer)
  }, [showUnlockIntro])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setChatLoading(true)

    try {
      const res = await fetch(N8N_CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.uid,
          lessonId: lesson?.id,
          message: userMsg,
          history: messages.map(m => ({ role: m.role, content: m.text })),
        }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', text: data.reply ?? data.message ?? 'Brak odpowiedzi.' }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Przepraszam, nie mogę teraz odpowiedzieć. Spróbuj ponownie.' }])
    } finally {
      setChatLoading(false)
    }
  }

  if (loading) return <div style={s.page}><p style={s.hint}>Ładowanie...</p></div>
  if (!noteAllowed) {
    return (
      <div style={s.page}>
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate('/student')}>← Wróć</button>
          <Logo height={26} />
          <span style={s.badge}>🔒 Zablokowane</span>
        </header>
        <main style={s.main}>
          <div style={s.noteCard}>
            <IllustrationState
              type="noTasks"
              title="Najpierw rozwiąż quiz"
              text="Notatka odblokuje się automatycznie po ukończeniu quizu z tej lekcji."
              action={
                <button className="btn btn-primary" onClick={() => navigate(`/student/lesson/${taskId}`)}>
                  Przejdź do quizu
                </button>
              }
            />
          </div>
        </main>
      </div>
    )
  }
  if (!lesson) return <div style={s.page}><p style={s.hint}>Nie znaleziono notatki.</p></div>

  const noteText = pickString(
    lesson?.note,
    lesson?.notes,
    lesson?.lessonNote,
    lesson?.generatedNote,
    lesson?.summary,
    lesson?.generated?.note,
    lesson?.data?.note
  )
  console.log('Firestore lesson.note:', lesson?.note)

  const exerciseSource = pickExerciseSource(
    task?.exercises,
    lesson?.exercises,
    lesson?.exercise,
    lesson?.generatedExercises,
    lesson?.generated?.exercises,
    lesson?.data?.exercises
  )
  const exerciseSet = normalizeExerciseSet(exerciseSource)
  const exercisesTotal = exerciseSet.flashcards.length + exerciseSet.quickCheck.length + exerciseSet.openTasks.length
  const exercisesUnlocked = task?.exercisesUnlocked === true || task?.quizStatus === 'completed' || task?.status === 'done'

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/student')}>← Wróć</button>
        <Logo height={26} />
        <span style={s.badge}>✅ Zaliczone</span>
      </header>

      <main style={s.main}>
        {showUnlockIntro && (
          <section style={s.unlockOverlay}>
            <div style={s.unlockCore}>
              <span style={s.lockClosed}>🔒</span>
              <span style={s.lockOpened}>🔓</span>
            </div>
            <p style={s.unlockIntroTitle}>Notatka odblokowana</p>
          </section>
        )}

        {contentReady && (
          <div style={{ ...s.contentWrap, animation: 'fadeIn .45s ease' }}>
          <div style={s.noteCard}>
            <div style={s.noteHero}>
              <p style={s.noteEyebrow}>Notatka z lekcji</p>
              <h1 style={s.noteTitle}>{lesson.title}</h1>
            </div>
            <div style={s.noteContent}>
              <ReactMarkdown components={markdownComponents}>{stripDuplicateTopic(noteText, lesson.title)}</ReactMarkdown>
            </div>
          </div>

          <div style={s.exercisesCard}>
            <div style={s.sectionHeader}>
              <div>
                <p style={s.sectionEyebrow}>Następny krok</p>
                <h2 style={s.exercisesTitle}>Ćwiczenia</h2>
              </div>
              <span style={exercisesTotal > 0 ? s.readyBadge : s.pendingBadge}>
                {exercisesTotal > 0 ? `${exercisesTotal} zadań` : 'W przygotowaniu'}
              </span>
            </div>
            {!exercisesUnlocked ? (
              <div style={s.exerciseEmpty}>
                <div style={s.exerciseIcon}>✓</div>
                <p style={s.exerciseEmptyTitle}>Najpierw ukończ quiz</p>
                <p style={s.exerciseEmptyText}>Po zaliczeniu quizu pojawią się tutaj zadania utrwalające materiał.</p>
              </div>
            ) : exercisesTotal === 0 ? (
              <div style={s.exerciseEmpty}>
                <div style={s.aiIcon}>AI</div>
                <p style={s.exerciseEmptyTitle}>Ćwiczenia są generowane</p>
                <p style={s.exerciseEmptyText}>Notatka jest już dostępna. Zadania pojawią się tutaj, gdy AI zakończy przygotowywanie materiału.</p>
              </div>
            ) : (
              <div style={s.exerciseModes}>
                {exerciseSet.flashcards.length > 0 && (
                  <section style={s.exerciseModeBlock}>
                    <div style={s.modeHeader}>
                      <span style={s.modeIcon}>F</span>
                      <div>
                        <h3 style={s.modeTitle}>Fiszki</h3>
                        <p style={s.modeHint}>Szybka powtórka pojęć z lekcji.</p>
                      </div>
                    </div>
                    <div style={s.flashcardGrid}>
                      {exerciseSet.flashcards.map((card, i) => (
                        <article key={`flash-${i}-${card.front.slice(0, 16)}`} style={s.flashcard}>
                          <p style={s.flashFront}>{card.front}</p>
                          <p style={s.flashBack}>{card.back}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {exerciseSet.quickCheck.length > 0 && (
                  <section style={s.exerciseModeBlock}>
                    <div style={s.modeHeader}>
                      <span style={s.modeIcon}>Q</span>
                      <div>
                        <h3 style={s.modeTitle}>Szybki sprawdzian</h3>
                        <p style={s.modeHint}>Pytania kontrolne do samodzielnej odpowiedzi.</p>
                      </div>
                    </div>
                    <div style={s.practiceList}>
                      {exerciseSet.quickCheck.map((item, i) => (
                        <article key={`quick-${i}-${item.question.slice(0, 16)}`} style={s.practiceItem}>
                          <p style={s.practiceQuestion}>{i + 1}. {item.question}</p>
                          {item.answer && <p style={s.practiceAnswer}>Odpowiedź: {item.answer}</p>}
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {exerciseSet.openTasks.length > 0 && (
                  <section style={s.exerciseModeBlock}>
                    <div style={s.modeHeader}>
                      <span style={s.modeIcon}>P</span>
                      <div>
                        <h3 style={s.modeTitle}>Praktyka</h3>
                        <p style={s.modeHint}>Krótkie polecenia do utrwalenia materiału.</p>
                      </div>
                    </div>
                    <div style={s.practiceList}>
                      {exerciseSet.openTasks.map((item, i) => (
                        <article key={`open-${i}-${item.prompt.slice(0, 16)}`} style={s.practiceItem}>
                          <p style={s.practiceQuestion}>{i + 1}. {item.prompt}</p>
                          {item.hint && <p style={s.practiceAnswer}>Wskazówka: {item.hint}</p>}
                        </article>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>

          <div style={s.chatCard}>
            <h3 style={s.chatTitle}>💬 Zapytaj o lekcję</h3>
            <div style={s.chatMessages}>
              {messages.map((m, i) => (
                <div
                  key={i}
                  style={{
                    ...s.bubble,
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    background: m.role === 'user' ? '#2563eb' : '#f3f4f6',
                    color: m.role === 'user' ? '#fff' : '#111827',
                  }}
                >
                  {m.text}
                </div>
              ))}
              {chatLoading && (
                <div style={{ ...s.bubble, alignSelf: 'flex-start', background: '#f3f4f6', color: '#9ca3af' }}>
                  Pisze...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
            <div style={s.chatInputRow}>
              <input
                style={s.chatInput}
                placeholder="Zadaj pytanie..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleChat()}
                disabled={chatLoading}
              />
              <button
                style={{ ...s.sendBtn, opacity: (!chatInput.trim() || chatLoading) ? 0.5 : 1 }}
                onClick={handleChat}
                disabled={!chatInput.trim() || chatLoading}
              >
                Wyślij
              </button>
            </div>
          </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lockClosedPulse {
          0% { opacity: 1; transform: scale(.85) rotate(0deg); }
          45% { opacity: 1; transform: scale(1.05) rotate(0deg); }
          100% { opacity: 0; transform: scale(1.25) rotate(14deg); }
        }
        @keyframes lockOpenedReveal {
          0% { opacity: 0; transform: scale(.8) rotate(16deg); }
          45% { opacity: 1; transform: scale(1.1) rotate(-6deg); }
          100% { opacity: 0; transform: scale(1.28) rotate(-10deg); }
        }
        @keyframes unlockGlow {
          0% { box-shadow: 0 0 0 0 rgba(37,99,235,.15); }
          65% { box-shadow: 0 0 0 26px rgba(37,99,235,.05); }
          100% { box-shadow: 0 0 0 44px rgba(37,99,235,0); }
        }
        @keyframes overlayFade {
          0% { opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  )
}

function stripDuplicateTopic(text, lessonTitle = '') {
  const lines = String(text || '').split('\n')
  let skipNextDuplicateTopic = false
  const normalizedLessonTitle = normalizeInlineText(lessonTitle)
  const filteredLines = []

  lines.forEach((rawLine) => {
    const line = rawLine.trim()

    if (line.startsWith('## ')) {
      const heading = line.slice(3).trim()
      if (normalizeInlineText(heading) === 'temat lekcji') {
        skipNextDuplicateTopic = true
        return
      }
    }

    if (skipNextDuplicateTopic) {
      skipNextDuplicateTopic = false
      if (!normalizedLessonTitle || normalizeInlineText(line) === normalizedLessonTitle) return
    }

    filteredLines.push(rawLine)
  })

  return filteredLines.join('\n')
}

function normalizeInlineText(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

const markdownComponents = {
  h2: ({ children }) => <h2 style={s.mdH2}>{children}</h2>,
  h3: ({ children }) => <h3 style={s.mdH3}>{children}</h3>,
  p: ({ children }) => <p style={s.mdP}>{children}</p>,
  ul: ({ children }) => <ul style={s.mdList}>{children}</ul>,
  ol: ({ children }) => <ol style={s.mdList}>{children}</ol>,
  li: ({ children }) => <li style={s.mdLi}>{children}</li>,
  strong: ({ children }) => <strong style={s.mdStrong}>{children}</strong>,
}

const s = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #eef4ff 100%)', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: 'rgba(255,255,255,.84)', borderBottom: '1px solid #dbeafe', backdropFilter: 'blur(8px)' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  badge: { fontSize: 13, color: '#16a34a', fontWeight: 600 },
  main: { width: 'min(980px, calc(100% - 28px))', margin: '0 auto', padding: '28px 0 42px' },
  unlockOverlay: { minHeight: 'clamp(320px, 55vh, 520px)', display: 'grid', placeItems: 'center', textAlign: 'center', animation: 'overlayFade 1.9s ease forwards' },
  unlockCore: { position: 'relative', width: 130, height: 130, borderRadius: 999, background: 'radial-gradient(circle at 30% 30%, #eff6ff, #dbeafe)', display: 'grid', placeItems: 'center', animation: 'unlockGlow 1.9s ease forwards' },
  lockClosed: { position: 'absolute', fontSize: 62, animation: 'lockClosedPulse 1.05s ease forwards' },
  lockOpened: { position: 'absolute', fontSize: 62, opacity: 0, animation: 'lockOpenedReveal .9s ease .75s forwards' },
  unlockIntroTitle: { margin: '16px 0 0', fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '.01em' },
  contentWrap: { display: 'grid', gap: 18 },
  noteCard: { background: '#fff', border: '1px solid #cfe1ff', borderRadius: 18, padding: 0, boxShadow: '0 16px 34px rgba(37,99,235,.1)', overflow: 'hidden' },
  noteHero: { padding: '26px 30px 22px', background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 72%)', borderBottom: '1px solid #dbeafe' },
  noteEyebrow: { margin: '0 0 8px', fontSize: 12, fontWeight: 800, color: '#2563eb', letterSpacing: '.08em', textTransform: 'uppercase' },
  noteTitle: { fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 850, color: '#0f172a', margin: 0, lineHeight: 1.08 },
  noteContent: { lineHeight: 1.7, padding: '26px 30px 30px' },
  exercisesCard: { background: '#fff', border: '1px solid #cfe1ff', borderRadius: 18, padding: 0, boxShadow: '0 14px 30px rgba(37,99,235,.08)', overflow: 'hidden' },
  sectionHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '20px 24px', background: 'linear-gradient(135deg, #ffffff 0%, #f0f7ff 100%)', borderBottom: '1px solid #dbeafe' },
  sectionEyebrow: { margin: '0 0 5px', fontSize: 11, fontWeight: 800, color: '#2563eb', letterSpacing: '.08em', textTransform: 'uppercase' },
  exercisesTitle: { margin: 0, fontSize: 22, fontWeight: 850, color: '#0f172a' },
  readyBadge: { flexShrink: 0, fontSize: 12, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 999, padding: '6px 10px', fontWeight: 800 },
  pendingBadge: { flexShrink: 0, fontSize: 12, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 999, padding: '6px 10px', fontWeight: 800 },
  exerciseEmpty: { margin: 22, minHeight: 150, border: '1px dashed #bfdbfe', borderRadius: 16, background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)', display: 'grid', justifyItems: 'center', alignContent: 'center', textAlign: 'center', padding: '26px 18px' },
  exerciseIcon: { width: 42, height: 42, borderRadius: 14, background: '#dcfce7', color: '#16a34a', display: 'grid', placeItems: 'center', fontSize: 22, fontWeight: 900, marginBottom: 10 },
  aiIcon: { width: 44, height: 44, borderRadius: 14, background: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 900, letterSpacing: '.04em', marginBottom: 10 },
  exerciseEmptyTitle: { margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0f172a' },
  exerciseEmptyText: { margin: 0, maxWidth: 520, fontSize: 15, lineHeight: 1.65, color: '#64748b' },
  exerciseModes: { padding: 22, display: 'grid', gap: 16 },
  exerciseModeBlock: { border: '1px solid #dbeafe', borderRadius: 16, background: '#fbfdff', padding: 18, display: 'grid', gap: 14 },
  modeHeader: { display: 'flex', alignItems: 'center', gap: 12 },
  modeIcon: { width: 38, height: 38, flexShrink: 0, borderRadius: 13, background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 14, fontWeight: 900 },
  modeTitle: { margin: '0 0 3px', fontSize: 18, fontWeight: 850, color: '#0f172a' },
  modeHint: { margin: 0, fontSize: 13, color: '#64748b', lineHeight: 1.45 },
  flashcardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 },
  flashcard: { minHeight: 132, border: '1px solid #bfdbfe', borderRadius: 14, background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)', padding: 15, display: 'grid', alignContent: 'space-between', gap: 10 },
  flashFront: { margin: 0, fontSize: 16, fontWeight: 850, color: '#1d4ed8', lineHeight: 1.35 },
  flashBack: { margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.55 },
  practiceList: { display: 'grid', gap: 10 },
  practiceItem: { border: '1px solid #e2e8f0', borderRadius: 13, background: '#ffffff', padding: '13px 14px' },
  practiceQuestion: { margin: 0, fontSize: 15, fontWeight: 750, color: '#0f172a', lineHeight: 1.55 },
  practiceAnswer: { margin: '7px 0 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 },
  chatCard: { background: '#fff', border: '1px solid #cfe1ff', borderRadius: 18, padding: '20px 20px 18px', boxShadow: '0 10px 24px rgba(37,99,235,.07)' },
  chatTitle: { fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 },
  chatMessages: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 14, padding: '4px 2px' },
  bubble: { padding: '10px 14px', borderRadius: 12, fontSize: 14, maxWidth: '80%', lineHeight: 1.5 },
  chatInputRow: { display: 'flex', gap: 8 },
  chatInput: { flex: 1, padding: '10px 14px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' },
  sendBtn: { padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  mdH2: { margin: '22px 0 12px', paddingTop: 4, fontSize: 23, lineHeight: 1.2, fontWeight: 800, color: '#0f172a' },
  mdH3: { margin: '15px 0 8px', fontSize: 18, lineHeight: 1.25, fontWeight: 700, color: '#1e293b' },
  mdP: { margin: 0, fontSize: 17, lineHeight: 1.78, color: '#334155' },
  mdList: { margin: 0, paddingLeft: 26, display: 'grid', gap: 8 },
  mdLi: { fontSize: 17, lineHeight: 1.72, color: '#334155' },
  mdStrong: { fontWeight: 850, color: '#1e293b' },
  mdSpacer: { height: 8 },
  hint: { color: '#9ca3af', fontSize: 14, padding: 32 },
}
