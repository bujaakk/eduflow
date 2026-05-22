import Logo from '../../components/Logo'
import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'

const pickString = (...values) => {
  const hit = values.find((v) => typeof v === 'string' && v.trim())
  return hit ? hit.trim() : ''
}

const pickArray = (...values) => {
  const hit = values.find((v) => Array.isArray(v) && v.length > 0)
  return hit || []
}

const N8N_CHAT_URL = 'WSTAW_URL_WEBHOOKA_MIKOLAJA_CHATBOT'

export default function NoteView() {
  const { taskId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [lesson, setLesson] = useState(null)
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [unlocked, setUnlocked] = useState(false)
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

      // Krótka animacja odblokowania
      setTimeout(() => setUnlocked(true), 400)
    }
    fetch()
  }, [taskId])

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

  const exercises = pickArray(
    task?.exercises,
    lesson?.exercises,
    lesson?.exercise,
    lesson?.generatedExercises,
    lesson?.generated?.exercises,
    lesson?.data?.exercises
  )
  const exercisesUnlocked = task?.exercisesUnlocked === true || task?.quizStatus === 'completed' || task?.status === 'done'

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/student')}>← Wróć</button>
        <Logo height={26} />
        <span style={s.badge}>✅ Zaliczone</span>
      </header>

      <main style={s.main}>
        {/* Animacja odblokowania */}
        {!unlocked ? (
          <div style={s.unlockScreen}>
            <div style={s.lockIcon}>🔒</div>
          </div>
        ) : (
          <div style={{ animation: 'fadeIn 0.5s ease' }}>
            <div style={s.unlockBanner}>
              <span style={{ fontSize: 28 }}>🔓</span>
              <span style={s.unlockText}>Notatka odblokowana!</span>
            </div>

            {/* Notatka */}
            <div style={s.noteCard}>
              <h1 style={s.noteTitle}>{lesson.title}</h1>
              <div style={s.noteContent}>
                {renderMarkdown(noteText)}
              </div>
            </div>

            <div style={s.noteCard}>
              <h2 style={s.exercisesTitle}>Ćwiczenia</h2>
              {!exercisesUnlocked ? (
                <p style={s.hint}>Ćwiczenia odblokują się po ukończeniu quizu.</p>
              ) : exercises.length === 0 ? (
                <p style={s.hint}>Ćwiczenia pojawią się po przetworzeniu lekcji przez AI.</p>
              ) : (
                <ul style={s.exercisesList}>
                  {exercises.map((exercise, i) => (
                    <li key={`${i}-${String(exercise).slice(0, 20)}`} style={s.exerciseItem}>{String(exercise)}</li>
                  ))}
                </ul>
              )}
            </div>

            {/* Mini-chatbot */}
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

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}

// Prosty renderer markdown → JSX (nagłówki, bold, bullet pointy)
function renderMarkdown(text) {
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 18, fontWeight: 700, marginTop: 20, marginBottom: 8, color: '#111827' }}>{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 16, marginBottom: 6, color: '#374151' }}>{line.slice(4)}</h3>
    if (line.startsWith('- ')) return <li key={i} style={{ marginLeft: 20, marginBottom: 4, color: '#374151' }}>{renderBold(line.slice(2))}</li>
    if (line.trim() === '') return <br key={i} />
    return <p key={i} style={{ marginBottom: 6, color: '#374151', lineHeight: 1.6 }}>{renderBold(line)}</p>
  })
}

function renderBold(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  logo: { fontSize: 20, fontWeight: 700, color: '#2563eb' },
  badge: { fontSize: 13, color: '#16a34a', fontWeight: 600 },
  main: { maxWidth: 720, margin: '0 auto', padding: '32px 24px' },
  unlockScreen: { textAlign: 'center', paddingTop: 100 },
  lockIcon: { fontSize: 64, animation: 'fadeIn 0.3s' },
  unlockBanner: { display: 'flex', alignItems: 'center', gap: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: '16px 20px', marginBottom: 24 },
  unlockText: { fontSize: 18, fontWeight: 700, color: '#16a34a' },
  noteCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '28px 32px', marginBottom: 24 },
  noteTitle: { fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 20 },
  noteContent: { lineHeight: 1.7 },
  exercisesTitle: { margin: '0 0 12px', fontSize: 20, fontWeight: 700, color: '#111827' },
  exercisesList: { margin: 0, paddingLeft: 18, display: 'grid', gap: 10 },
  exerciseItem: { color: '#374151', lineHeight: 1.6 },
  chatCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '20px' },
  chatTitle: { fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 16 },
  chatMessages: { display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 320, overflowY: 'auto', marginBottom: 14, padding: '4px 0' },
  bubble: { padding: '10px 14px', borderRadius: 12, fontSize: 14, maxWidth: '80%', lineHeight: 1.5 },
  chatInputRow: { display: 'flex', gap: 8 },
  chatInput: { flex: 1, padding: '10px 14px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' },
  sendBtn: { padding: '10px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  hint: { color: '#9ca3af', fontSize: 14, padding: 32 },
}
