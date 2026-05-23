import Logo from '../../components/Logo'
import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp, onSnapshot, increment } from 'firebase/firestore'
import { auth, db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'

const N8N_GRADE_URL = 'https://n8n.yourwayai.pl/webhook/eduflow-grade'

const normalizeQuestions = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
      .filter(Boolean)
  }

  return []
}

const pickLessonQuestions = (lessonData) => {
  if (!lessonData || typeof lessonData !== 'object') return []
  const candidates = [
    lessonData.quiz,
    lessonData.questions,
    lessonData.quizQuestions,
    lessonData.generatedQuiz,
    lessonData.generated?.quiz,
    lessonData.data?.quiz,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeQuestions(candidate)
    if (normalized.length > 0) return normalized
  }

  return []
}

async function submitAnswer(taskId, lessonId, questionIndex, question, answer) {
  console.log('Wysyłam pytanie:', questionIndex, question, answer)

  const response = await fetch(N8N_GRADE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: auth.currentUser.uid,
      taskId,
      lessonId,
      questionIndex,
      question,
      answer,
    }),
  })

  let payload = null
  try {
    payload = await response.json()
  } catch {
    payload = { success: false, reason: 'Nieprawidłowa odpowiedź serwera oceniania.' }
  }

  if (!response.ok && payload?.success !== true) {
    return {
      success: false,
      reason: payload?.reason || payload?.message || `Błąd oceniania (${response.status}).`,
    }
  }

  return payload
}

const getLevelColor = (value) => {
  if (value < 40) return '#ef4444'
  if (value <= 70) return '#f59e0b'
  return '#22c55e'
}

export default function LessonTasks() {
  const { taskId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [task, setTask] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [pendingSubmissions, setPendingSubmissions] = useState(0)
  const [optimisticAnsweredCount, setOptimisticAnsweredCount] = useState(0)
  const [redirectCountdown, setRedirectCountdown] = useState(5)
  const [loading, setLoading] = useState(true)
  const [focusWarning, setFocusWarning] = useState('')
  const lastLeaveEventAtRef = useRef(0)
  const optimisticAnsweredRef = useRef(0)
  const initializedIndexRef = useRef(false)
  const inFlightIndexesRef = useRef(new Set())
  const submittedIndexesRef = useRef(new Set())

  useEffect(() => {
    optimisticAnsweredRef.current = 0
    initializedIndexRef.current = false
    inFlightIndexesRef.current = new Set()
    submittedIndexesRef.current = new Set()
    setCurrentIndex(0)
    setAnswer('')
    setFeedback('')
    setSubmitError('')
    setPendingSubmissions(0)
    setOptimisticAnsweredCount(0)
  }, [taskId])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'tasks', taskId), (taskSnap) => {
      if (!taskSnap.exists()) {
        setTask(null)
        setLoading(false)
        return
      }

      const taskData = { id: taskSnap.id, ...taskSnap.data() }
      const taskQuestions = normalizeQuestions(taskData.questions)
      const normalizedTask = { ...taskData, questions: taskQuestions }
      setTask(normalizedTask)

      const total = taskQuestions.length
      const rawAnswered = Number(taskData.answeredCount ?? 0)
      const answered = Math.max(0, Math.min(total, rawAnswered))
      const maxIndex = Math.max(total - 1, 0)

      if (rawAnswered > total && total > 0) {
        updateDoc(doc(db, 'tasks', taskId), { answeredCount: total }).catch(() => {})
      }

      if (answered > optimisticAnsweredRef.current) {
        optimisticAnsweredRef.current = answered
        setOptimisticAnsweredCount(answered)
      }

      const mergedAnswered = Math.max(answered, optimisticAnsweredRef.current)
      const mergedIndex = Math.min(Math.max(mergedAnswered, 0), maxIndex)
      if (!initializedIndexRef.current) {
        initializedIndexRef.current = true
        setCurrentIndex(mergedIndex)
      } else {
        setCurrentIndex((prev) => Math.max(Math.min(Math.max(prev, 0), maxIndex), mergedIndex))
      }
      setLoading(false)
    })

    return () => unsub()
  }, [taskId])

  useEffect(() => {
    const fetchLesson = async () => {
      if (!task?.lessonId) return

      const lessonSnap = await getDoc(doc(db, 'lessons', task.lessonId))
      if (!lessonSnap.exists()) return

      const lessonData = { id: lessonSnap.id, ...lessonSnap.data() }
      setLesson(lessonData)
    }

    fetchLesson()
  }, [task?.lessonId])

  const totalQuestions = task?.questions?.length ?? 0
  const answeredCount = Math.max(0, Math.min(totalQuestions, Number(task?.answeredCount ?? 0)))
  const effectiveAnsweredCount = Math.max(answeredCount, optimisticAnsweredCount)
  const isTaskCompleted = task?.quizStatus === 'completed' || task?.status === 'done'
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(totalQuestions - 1, 0))
  const currentQuestion = task?.questions?.[safeIndex] ?? ''
  const progress = totalQuestions > 0 ? Math.round((Math.min(effectiveAnsweredCount, totalQuestions) / totalQuestions) * 100) : 0
  const waitingForFinalAnalysis = !isTaskCompleted && totalQuestions > 0 && effectiveAnsweredCount >= totalQuestions && pendingSubmissions > 0

  useEffect(() => {
    if (isTaskCompleted) return undefined

    const handleBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isTaskCompleted])

  useEffect(() => {
    if (!taskId || isTaskCompleted) return undefined

    const reportLeave = async () => {
      const now = Date.now()
      if (now - lastLeaveEventAtRef.current < 1200) return
      lastLeaveEventAtRef.current = now
      setFocusWarning('Nie opuszczaj karty podczas rozwiązywania quizu. Zdarzenie zostało zapisane dla nauczyciela.')

      try {
        await updateDoc(doc(db, 'tasks', taskId), {
          tabLeaveCount: increment(1),
          lastTabLeaveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
      } catch {
        // no-op: warning is still shown locally even if network update fails
      }
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportLeave()
      }
    }

    const onBlur = () => {
      reportLeave()
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onBlur)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onBlur)
    }
  }, [taskId, isTaskCompleted, task?.tabLeaveCount])

  useEffect(() => {
    if (!isTaskCompleted) return undefined
    setRedirectCountdown(5)
    const interval = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          navigate(`/student/note/${taskId}`, { replace: true, state: { justUnlocked: true } })
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isTaskCompleted, navigate, taskId])

  const goToLessonNote = () => {
    navigate(`/student/note/${taskId}`, { state: { justUnlocked: true } })
  }

  const processSubmissionInBackground = async ({
    submittedAnswer,
    submittedIndex,
    submittedQuestion,
    lessonId,
    total,
  }) => {
    try {
      const result = await submitAnswer(taskId, lessonId, submittedIndex, submittedQuestion, submittedAnswer)
      if (!result?.success) {
        setSubmitError(result?.reason || `Nie udało się ocenić pytania ${submittedIndex + 1}.`)
        return
      }

      const minAnswered = Math.min(total, submittedIndex + 1)
      const nextAnsweredCount = typeof result.answeredCount === 'number'
        ? Math.max(minAnswered, Math.max(0, Math.min(total, Number(result.answeredCount))))
        : minAnswered
      const completedByProgress = nextAnsweredCount >= total
      const isCompleted = result.taskCompleted === true || completedByProgress

      const taskPatch = {}
      taskPatch.answeredCount = nextAnsweredCount
      if (isCompleted) {
        taskPatch.status = 'done'
        taskPatch.quizStatus = 'completed'
        if (typeof result.noteUnlocked === 'boolean') {
          taskPatch.noteUnlocked = result.noteUnlocked
        } else {
          taskPatch.noteUnlocked = true
        }
      } else if (typeof result.answeredCount === 'number') {
        taskPatch.status = 'in_progress'
        taskPatch.quizStatus = 'in_progress'
      }
      if (!isCompleted && typeof result.noteUnlocked === 'boolean') taskPatch.noteUnlocked = result.noteUnlocked
      if (typeof result.exercisesUnlocked === 'boolean') taskPatch.exercisesUnlocked = result.exercisesUnlocked

      if (Object.keys(taskPatch).length > 0) {
        await updateDoc(doc(db, 'tasks', taskId), taskPatch)
        setTask((prev) => (prev ? { ...prev, ...taskPatch } : prev))
      }

      optimisticAnsweredRef.current = Math.max(optimisticAnsweredRef.current, nextAnsweredCount)
      setOptimisticAnsweredCount(optimisticAnsweredRef.current)
      setFeedback('Odpowiedź oceniona i zapisana.')
    } catch {
      setSubmitError(`Nie udało się wysłać pytania ${submittedIndex + 1}. Sprawdź internet i spróbuj ponownie.`)
    } finally {
      inFlightIndexesRef.current.delete(submittedIndex)
      setPendingSubmissions((prev) => Math.max(0, prev - 1))
    }
  }

  const handleSubmit = () => {
    if (!answer.trim() || !task || !currentQuestion || isTaskCompleted) return

    const submittedAnswer = answer.trim()
    const submittedIndex = safeIndex
    if (inFlightIndexesRef.current.has(submittedIndex) || submittedIndexesRef.current.has(submittedIndex)) return
    const submittedQuestion = task.questions?.[submittedIndex] ?? ''
    if (!submittedQuestion) {
      setSubmitError('Brak pytania do wysłania.')
      return
    }

    setSubmitError('')
    setFeedback('Odpowiedź wysłana. Ocenianie trwa w tle.')
    inFlightIndexesRef.current.add(submittedIndex)
    submittedIndexesRef.current.add(submittedIndex)
    setPendingSubmissions((prev) => prev + 1)

    const optimisticNextAnswered = Math.min(totalQuestions, submittedIndex + 1)
    optimisticAnsweredRef.current = Math.max(optimisticAnsweredRef.current, optimisticNextAnswered)
    setOptimisticAnsweredCount(optimisticAnsweredRef.current)

    if (optimisticNextAnswered < totalQuestions) {
      const nextIndex = Math.min(optimisticNextAnswered, Math.max(totalQuestions - 1, 0))
      setCurrentIndex((prev) => Math.max(prev, nextIndex))
    }

    setAnswer('')

    void processSubmissionInBackground({
      submittedAnswer,
      submittedIndex,
      submittedQuestion,
      lessonId: task.lessonId,
      total: totalQuestions,
    })
  }

  if (loading) return (
    <div style={s.page}>
      <main style={s.main}>
        <div className="ui-card loading-panel" aria-label="Ładowanie lekcji">
          <div className="loading-title" />
          <div className="loading-row">
            <div className="loading-line w-85" />
            <div className="loading-line w-70" />
            <div className="loading-line w-55" />
          </div>
        </div>
      </main>
    </div>
  )
  if (!task) return (
    <div style={s.page}>
      <main style={s.main}>
        <div className="ui-card">
          <IllustrationState type="error" title="Nie znaleziono zadania" text="Zadanie mogło zostać usunięte albo nie masz do niego dostępu." />
        </div>
      </main>
    </div>
  )

  if (totalQuestions === 0) return (
    <div style={s.page}>
      <main style={s.main}>
        <div className="ui-card">
          <IllustrationState type="noTasks" title="Brak pytań w tej lekcji" text="Nauczyciel lub AI nie dodało jeszcze zadań sprawdzających." />
        </div>
      </main>
    </div>
  )

  const currentQuestionNumber = Math.min(safeIndex + 1, totalQuestions)
  const progressDisplay = isTaskCompleted
    ? `${totalQuestions}/${totalQuestions}`
    : `${currentQuestionNumber}/${totalQuestions}`

  return (
    <div className="app-shell">
      <header className="app-header">
        <button style={s.backBtn} onClick={() => navigate('/student')}>← Wróć</button>
        <Logo height={26} />
        <span style={s.progressLabel}>Pytanie {currentQuestionNumber}/{totalQuestions}</span>
      </header>

      <main style={s.main}>
        {isTaskCompleted ? (
          <section style={s.finishSection}>
            <div style={s.finishCard}>
              <IllustrationState
                type="success"
                title="Quiz wypełniony"
                text="Świetna robota. Za chwilę przeniesiemy Cię do strony lekcji z notatką."
              />
              <p style={s.countdownText}>Przekierowanie za {redirectCountdown} s</p>
              <button style={s.finishBtn} onClick={goToLessonNote}>Przejdź teraz</button>
            </div>
          </section>
        ) : waitingForFinalAnalysis ? (
          <section style={s.finishSection}>
            <div style={s.finishCard}>
              <IllustrationState
                type="noTasks"
                title="Poczekaj na analizę do końca"
                text="Ostatnia odpowiedź została wysłana. AI kończy sprawdzanie, a notatka odblokuje się automatycznie za chwilę."
              />
              <p style={s.pendingInfo}>⏳ Trwa ocenianie ostatniej odpowiedzi</p>
              {!!submitError && <p style={s.errorText}>❌ {submitError}</p>}
            </div>
          </section>
        ) : (
          <>
            <section style={s.heroCard}>
              <div>
                <p style={s.eyebrow}>Tryb lekcji</p>
                <h2 style={s.lessonTitle}>Quiz z lekcji</h2>
                <p style={s.lessonSubTitle}>{lesson?.title ?? 'Lekcja'}</p>
                <p style={s.heroHint}>Skup się na odpowiedziach. Po zakończeniu quizu odblokujesz notatkę i dalsze materiały.</p>
              </div>
              <div style={s.heroMetaWrap}>
                <div style={s.heroMetaCard}>
                  <span style={s.heroMetaLabel}>Postęp</span>
                  <span style={s.heroMetaValue}>{progressDisplay}</span>
                </div>
                <div style={s.heroMetaCard}>
                  <span style={s.heroMetaLabel}>Ukończenie</span>
                  <span style={s.heroMetaValue}>{progress}%</span>
                </div>
              </div>
            </section>

            <div style={s.progressBar}>
              <div style={{ ...s.progressFill, width: `${progress}%` }} />
            </div>

            <section style={s.layoutGrid}>
              <article style={s.quizPanel}>
              <>
                <div style={s.panelTopRow}>
                  <span style={s.questionLabel}>Pytanie {currentQuestionNumber}/{totalQuestions}</span>
                </div>

                <p style={s.question}>{currentQuestion}</p>

                <textarea
                  style={s.textarea}
                  placeholder="Wpisz swoją odpowiedź..."
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={6}
                />

                {!!submitError && <p style={s.errorText}>❌ {submitError}</p>}
                {!!focusWarning && <p style={s.warningText}>⚠ Zdarzenie zostało zapisane dla nauczyciela.</p>}
                {!!feedback && <p style={s.feedbackSent}>{feedback}</p>}
                {pendingSubmissions > 0 && (
                  <p style={s.pendingInfo}>⏳ Trwa ocenianie w tle: {pendingSubmissions}</p>
                )}

                <button
                  style={{ ...s.btn, opacity: !answer.trim() ? 0.5 : 1 }}
                  onClick={handleSubmit}
                  disabled={!answer.trim()}
                >
                  Wyślij odpowiedź
                </button>
              </>
              </article>

              <aside style={s.sidePanel}>
                <div style={s.guardCard}>
                  <p style={s.guardTitle}>Tryb bezpieczny</p>
                  <p style={s.guardHint}>Nie opuszczaj karty podczas rozwiązywania quizu.</p>
                </div>
              </aside>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  progressLabel: { fontSize: 13, color: '#6b7280' },
  main: { width: 'min(1120px, calc(100% - 32px))', margin: '0 auto', padding: '30px 0 50px' },
  heroCard: {
    background: 'linear-gradient(135deg, rgba(37,99,235,.95), rgba(14,116,144,.88))',
    borderRadius: 24,
    padding: '24px 26px',
    color: '#fff',
    display: 'grid',
    gridTemplateColumns: '1.5fr 1fr',
    gap: 18,
    marginBottom: 14,
    boxShadow: '0 20px 45px rgba(37,99,235,.22)',
  },
  eyebrow: { margin: 0, fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.72)', fontWeight: 700 },
  lessonTitle: { margin: '8px 0 6px', fontSize: 'clamp(26px, 3.8vw, 36px)', lineHeight: 1.08, fontWeight: 800 },
  lessonSubTitle: { margin: '0 0 6px', color: 'rgba(255,255,255,.82)', fontSize: 14, fontWeight: 600 },
  heroHint: { margin: 0, color: 'rgba(255,255,255,.84)', fontSize: 14, lineHeight: 1.6, maxWidth: 560 },
  heroMetaWrap: { display: 'grid', gap: 8, alignContent: 'start' },
  heroMetaCard: { display: 'grid', gap: 2, background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.24)', borderRadius: 14, padding: '10px 12px' },
  heroMetaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(255,255,255,.7)', fontWeight: 700 },
  heroMetaValue: { fontSize: 20, fontWeight: 800 },
  progressBar: { height: 8, background: '#dbeafe', borderRadius: 999, marginBottom: 16, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#2563eb', borderRadius: 4, transition: 'width 0.4s' },
  layoutGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14, alignItems: 'start' },
  quizPanel: { background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 20, padding: 20, boxShadow: '0 14px 34px rgba(15,23,42,.08)' },
  sidePanel: { display: 'grid', gap: 12 },
  panelTopRow: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 },
  questionLabel: { fontSize: 12, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.05em' },
  question: { fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 14, lineHeight: 1.42 },
  textarea: { width: '100%', padding: '13px 14px', fontSize: 15, border: '1px solid #bfdbfe', borderRadius: 12, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'sans-serif', minHeight: 154, background: '#f8fbff' },
  btn: { marginTop: 12, width: '100%', padding: '13px', fontSize: 15, fontWeight: 700, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer' },
  errorText: { marginTop: 10, marginBottom: 0, color: '#dc2626', fontSize: 13, fontWeight: 600 },
  warningText: { marginTop: 8, marginBottom: 0, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, fontWeight: 600, padding: '8px 10px' },
  feedbackSent: { marginTop: 8, marginBottom: 0, fontSize: 13, color: '#166534', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8, padding: '8px 10px', fontWeight: 600 },
  pendingInfo: { marginTop: 8, marginBottom: 0, fontSize: 13, color: '#1d4ed8', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: '8px 10px', fontWeight: 700 },
  guardCard: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: '12px 14px' },
  guardTitle: { margin: '0 0 4px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: '#a16207' },
  guardHint: { margin: 0, fontSize: 13, fontWeight: 600, color: '#92400e', lineHeight: 1.45 },
  finishSection: { paddingTop: 24 },
  finishCard: { background: '#ffffff', border: '1px solid #bbf7d0', borderRadius: 20, padding: '26px 20px', boxShadow: '0 16px 32px rgba(16,185,129,.12)', display: 'grid', gap: 12, justifyItems: 'center' },
  countdownText: { margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' },
  finishBtn: { marginTop: 2, width: 'min(360px, 100%)', padding: '12px 14px', borderRadius: 12, border: 'none', background: '#16a34a', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer' },
  hint: { color: '#9ca3af', fontSize: 14, padding: 32 },
}
