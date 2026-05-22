import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, addDoc, updateDoc, collection, serverTimestamp, increment } from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'

const N8N_GRADE_URL = 'WSTAW_URL_WEBHOOKA_MIKOLAJA_OCENIANIE'

export default function LessonTasks() {
  const { taskId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState(null) // { score: 'pass'|'fail', text: '' }
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const taskSnap = await getDoc(doc(db, 'tasks', taskId))
      if (!taskSnap.exists()) return
      const taskData = { id: taskSnap.id, ...taskSnap.data() }
      setTask(taskData)
      setCurrentIndex(taskData.answeredCount ?? 0)

      const lessonSnap = await getDoc(doc(db, 'lessons', taskData.lessonId))
      if (lessonSnap.exists()) setLesson({ id: lessonSnap.id, ...lessonSnap.data() })
      setLoading(false)
    }
    fetch()
  }, [taskId])

  const handleSubmit = async () => {
    if (!answer.trim()) return
    setSending(true)
    setFeedback(null)

    try {
      const question = task.questions[currentIndex]

      // Wywołaj n8n — ocenianie odpowiedzi
      let aiFeedback = { score: 'pass', text: 'Dobra odpowiedź!' }
      try {
        const res = await fetch(N8N_GRADE_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: user.uid,
            taskId,
            lessonId: task.lessonId,
            questionIndex: currentIndex,
            question,
            answer: answer.trim(),
          }),
        })
        const data = await res.json()
        aiFeedback = { score: data.score, text: data.feedback }
      } catch {
        // n8n niedostępne — nie blokuj ucznia, pokaż placeholder
        aiFeedback = { score: 'pass', text: 'Odpowiedź zapisana. (Feedback AI niedostępny)' }
      }

      // Zapisz odpowiedź do Firestore
      await addDoc(collection(db, 'answers'), {
        taskId,
        studentId: user.uid,
        lessonId: task.lessonId,
        questionIndex: currentIndex,
        content: answer.trim(),
        aiScore: aiFeedback.score,
        feedback: aiFeedback.text,
        timestamp: serverTimestamp(),
      })

      // Zaktualizuj licznik w tasku
      const nextIndex = currentIndex + 1
      const isLast = nextIndex >= task.questions.length

      await updateDoc(doc(db, 'tasks', taskId), {
        answeredCount: increment(1),
        status: isLast ? 'done' : 'in_progress',
        quizStatus: isLast ? 'completed' : 'in_progress',
        noteUnlocked: isLast ? true : false,
        exercisesUnlocked: isLast ? true : false,
      })

      setFeedback(aiFeedback)
      setTask(prev => ({
        ...prev,
        answeredCount: nextIndex,
        status: isLast ? 'done' : 'in_progress',
        quizStatus: isLast ? 'completed' : 'in_progress',
        noteUnlocked: isLast ? true : false,
        exercisesUnlocked: isLast ? true : false,
      }))
    } finally {
      setSending(false)
    }
  }

  const handleNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex >= task.questions.length) {
      // Wszystkie pytania zaliczone → idź do notatki
      navigate(`/student/note/${taskId}`)
    } else {
      setCurrentIndex(nextIndex)
      setAnswer('')
      setFeedback(null)
    }
  }

  if (loading) return <div style={s.page}><p style={s.hint}>Ładowanie...</p></div>
  if (!task) return (
    <div style={s.page}>
      <main style={s.main}>
        <div className="ui-card">
          <IllustrationState type="error" title="Nie znaleziono zadania" text="Zadanie mogło zostać usunięte albo nie masz do niego dostępu." />
        </div>
      </main>
    </div>
  )

  if ((task.questions?.length ?? 0) === 0) return (
    <div style={s.page}>
      <main style={s.main}>
        <div className="ui-card">
          <IllustrationState type="noTasks" title="Brak pytań w tej lekcji" text="Nauczyciel lub AI nie dodało jeszcze zadań sprawdzających." />
        </div>
      </main>
    </div>
  )

  const total = task.questions?.length ?? 0
  const progress = Math.round(((currentIndex) / total) * 100)
  const allDone = task.status === 'done' && feedback !== null

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/student')}>← Wróć</button>
        <Logo height={26} />
        <span style={s.progressLabel}>Pytanie {Math.min(currentIndex + 1, total)}/{total}</span>
      </header>

      <main style={s.main}>
        <h2 style={s.lessonTitle}>{lesson?.title ?? 'Lekcja'}</h2>

        {/* Pasek postępu */}
        <div style={s.progressBar}>
          <div style={{ ...s.progressFill, width: `${progress}%` }} />
        </div>

        <div style={s.card}>
          <p style={s.questionLabel}>Pytanie {currentIndex + 1}</p>
          <p style={s.question}>{task.questions?.[currentIndex]}</p>

          {!feedback ? (
            <>
              <textarea
                style={s.textarea}
                placeholder="Wpisz swoją odpowiedź..."
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                rows={4}
                disabled={sending}
              />
              <button
                style={{ ...s.btn, opacity: (!answer.trim() || sending) ? 0.5 : 1 }}
                onClick={handleSubmit}
                disabled={!answer.trim() || sending}
              >
                {sending ? 'Sprawdzanie...' : 'Wyślij odpowiedź'}
              </button>
            </>
          ) : (
            <div style={{
              ...s.feedbackBox,
              borderColor: feedback.score === 'pass' ? '#22c55e' : '#ef4444',
              background: feedback.score === 'pass' ? '#f0fdf4' : '#fef2f2',
            }}>
              <IllustrationState
                type={feedback.score === 'pass' ? 'success' : 'error'}
                title={feedback.score === 'pass' ? 'Dobrze!' : 'Powtórz odpowiedź'}
                text={feedback.text}
                compact
              />
              <button style={s.nextBtn} onClick={handleNext}>
                {allDone ? '🔓 Odblokuj notatkę' : 'Następne pytanie →'}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  logo: { fontSize: 20, fontWeight: 700, color: '#2563eb' },
  progressLabel: { fontSize: 13, color: '#6b7280' },
  main: { maxWidth: 680, margin: '0 auto', padding: '32px 24px' },
  lessonTitle: { fontSize: 20, fontWeight: 600, color: '#111827', marginBottom: 16 },
  progressBar: { height: 6, background: '#e5e7eb', borderRadius: 4, marginBottom: 28, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#2563eb', borderRadius: 4, transition: 'width 0.4s' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '28px' },
  questionLabel: { fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  question: { fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 20, lineHeight: 1.5 },
  textarea: { width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 10, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'sans-serif' },
  btn: { marginTop: 12, width: '100%', padding: '13px', fontSize: 15, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  feedbackBox: { marginTop: 16, border: '2px solid', borderRadius: 12, padding: '18px 20px' },
  nextBtn: { marginTop: 14, background: '#111827', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  hint: { color: '#9ca3af', fontSize: 14, padding: 32 },
}
