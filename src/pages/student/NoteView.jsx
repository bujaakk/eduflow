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

const parseExerciseItem = (item) => {
  if (typeof item !== 'string') return item
  const trimmed = item.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return item
  try {
    return JSON.parse(trimmed)
  } catch {
    return item
  }
}

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
      const parsedItem = parseExerciseItem(item)
      if (typeof parsedItem === 'string') {
        addOpenTask(parsedItem)
        return
      }
      const type = String(parsedItem?.type || parsedItem?.mode || '').toLowerCase()
      if (type.includes('flash') || type.includes('fisz')) addFlashcard(parsedItem)
      else if (type.includes('quick') || type.includes('quiz') || type.includes('check')) addQuickCheck(parsedItem)
      else addOpenTask(parsedItem)
    })
    return set
  }

  if (source && typeof source === 'object') {
    ;[...(source.flashcards || []), ...(source.fiszki || [])].map(parseExerciseItem).forEach(addFlashcard)
    ;[...(source.quickCheck || []), ...(source.quiz || [])].map(parseExerciseItem).forEach(addQuickCheck)
    ;[...(source.openTasks || []), ...(source.tasks || [])].map(parseExerciseItem).forEach(addOpenTask)
  }

  return set
}

const N8N_CHAT_URL = 'https://n8n.yourwayai.pl/webhook/eduflow-chatbot'
const N8N_EXERCISE_CHECK_URL = 'https://n8n.yourwayai.pl/webhook/eduflow-check-exercise'

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
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [activeExercise, setActiveExercise] = useState(null)
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0)
  const [flashcardFlipped, setFlashcardFlipped] = useState(false)
  const [exerciseAnswer, setExerciseAnswer] = useState('')
  const [exerciseFeedback, setExerciseFeedback] = useState(null)
  const [exerciseChecking, setExerciseChecking] = useState(false)
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

  const handleChat = async (messageOverride = '') => {
    const userMsg = String(messageOverride || chatInput).trim()
    if (!userMsg || chatLoading) return
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
          lessonTitle: lesson?.title || '',
          lessonTopicGuard: 'Odpowiadaj tylko na tematy zwiazane z tematem lekcji. Jesli pytanie jest spoza tematu, odmow i popros o pytanie zwiazane z lekcja.',
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

  const openExerciseMode = (mode, items) => {
    setActiveExercise({ mode, items })
    setActiveExerciseIndex(0)
    setFlashcardFlipped(false)
    setExerciseAnswer('')
    setExerciseFeedback(null)
  }

  const closeExerciseMode = () => {
    setActiveExercise(null)
    setActiveExerciseIndex(0)
    setFlashcardFlipped(false)
    setExerciseAnswer('')
    setExerciseFeedback(null)
    setExerciseChecking(false)
  }

  const moveExercise = (direction) => {
    if (!activeExercise?.items?.length) return
    setActiveExerciseIndex((prev) => {
      const next = Math.min(Math.max(prev + direction, 0), activeExercise.items.length - 1)
      return next
    })
    setFlashcardFlipped(false)
    setExerciseAnswer('')
    setExerciseFeedback(null)
  }

  const handleCheckExercise = async () => {
    if (!activeExercise || !exerciseAnswer.trim() || exerciseChecking) return
    const item = activeExercise.items[activeExerciseIndex]
    setExerciseChecking(true)
    setExerciseFeedback(null)

    if (N8N_EXERCISE_CHECK_URL.includes('WSTAW_URL')) {
      setExerciseFeedback({
        correct: null,
        feedback: 'Webhook do sprawdzania ćwiczeń nie jest jeszcze podpięty. Miqoss musi dodać URL w frontendzie lub oddać gotowy endpoint.',
      })
      setExerciseChecking(false)
      return
    }

    try {
      const response = await fetch(N8N_EXERCISE_CHECK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: user.uid,
          taskId,
          lessonId: lesson?.id,
          lessonTitle: lesson?.title,
          mode: activeExercise.mode,
          question: item.question || item.prompt,
          expectedAnswer: item.answer || '',
          hint: item.hint || '',
          userAnswer: exerciseAnswer.trim(),
          note: noteText,
        }),
      })
      const data = await response.json()
      setExerciseFeedback({
        correct: typeof data.correct === 'boolean' ? data.correct : data.pass,
        feedback: data.feedback || data.message || 'Odpowiedź sprawdzona.',
        suggestion: data.suggestion || data.nextStep || '',
      })
    } catch {
      setExerciseFeedback({ correct: null, feedback: 'Nie udało się sprawdzić odpowiedzi. Spróbuj ponownie.' })
    } finally {
      setExerciseChecking(false)
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
    {
      flashcards: lesson?.flashcards,
      quickCheck: lesson?.quickCheck,
      openTasks: lesson?.openTasks,
    },
    {
      flashcards: task?.flashcards,
      quickCheck: task?.quickCheck,
      openTasks: task?.openTasks,
    },
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
  const lessonTopic = String(lesson?.title || 'tej lekcji').trim()
  const suggestedQuestions = [
    `Wyjaśnij najważniejsze pojęcia z tematu: ${lessonTopic}.`,
    `Jak ten temat może pojawić się na sprawdzianie?`,
    `Podaj 3 praktyczne przykłady związane z: ${lessonTopic}.`,
    `Jakie błędy uczniowie najczęściej robią w tym temacie?`,
  ]

  const useSuggestedQuestion = (text) => {
    setChatOpen(true)
    handleChat(text)
  }

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
              <UnlockPadlock />
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
                      {exerciseSet.flashcards.slice(0, 3).map((card, i) => (
                        <article key={`flash-${i}-${card.front.slice(0, 16)}`} style={s.flashcardPreview}>
                          <p style={s.flashFront}>{card.front}</p>
                          <p style={s.flashBack}>{card.back}</p>
                        </article>
                      ))}
                    </div>
                    <button style={s.startModeBtn} onClick={() => openExerciseMode('flashcards', exerciseSet.flashcards)}>Uruchom fiszki</button>
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
                      {exerciseSet.quickCheck.slice(0, 3).map((item, i) => (
                        <article key={`quick-${i}-${item.question.slice(0, 16)}`} style={s.practiceItem}>
                          <p style={s.practiceQuestion}>{i + 1}. {item.question}</p>
                          {item.answer && <p style={s.practiceAnswer}>Odpowiedź: {item.answer}</p>}
                        </article>
                      ))}
                    </div>
                    <button style={s.startModeBtn} onClick={() => openExerciseMode('quickCheck', exerciseSet.quickCheck)}>Uruchom sprawdzian</button>
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
                      {exerciseSet.openTasks.slice(0, 3).map((item, i) => (
                        <article key={`open-${i}-${item.prompt.slice(0, 16)}`} style={s.practiceItem}>
                          <p style={s.practiceQuestion}>{i + 1}. {item.prompt}</p>
                          {item.hint && <p style={s.practiceAnswer}>Wskazówka: {item.hint}</p>}
                        </article>
                      ))}
                    </div>
                    <button style={s.startModeBtn} onClick={() => openExerciseMode('openTasks', exerciseSet.openTasks)}>Uruchom praktykę</button>
                  </section>
                )}
              </div>
            )}
          </div>

          </div>
        )}
      </main>

      {contentReady && (
        <>
          {!chatOpen && (
            <button style={s.chatFab} onClick={() => setChatOpen(true)} aria-label="Otwórz czat lekcji">
              💬
            </button>
          )}

          {chatOpen && (
            <div style={s.chatWidget}>
              <div style={s.chatWidgetHeader}>
                <div>
                  <p style={s.chatWidgetEyebrow}>Czat lekcji</p>
                  <h3 style={s.chatWidgetTitle}>Zapytaj o temat: {lessonTopic}</h3>
                  <p style={s.chatWidgetSubTitle}>Odpowiedzi trzymają się zakresu tej lekcji.</p>
                </div>
                <button style={s.chatCloseBtn} onClick={() => setChatOpen(false)} aria-label="Zamknij czat">×</button>
              </div>

              <div style={s.suggestionsWrap}>
                <p style={s.suggestionsLabel}>Szybkie pytania</p>
                {suggestedQuestions.map((question, index) => (
                  <button key={`suggestion-${index}`} style={s.suggestionChip} onClick={() => useSuggestedQuestion(question)}>
                    <span style={s.suggestionNumber}>{index + 1}</span>
                    {question}
                  </button>
                ))}
              </div>

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
                    <ReactMarkdown components={chatMarkdownComponents}>{m.text}</ReactMarkdown>
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
                  placeholder="Zadaj pytanie o temat lekcji..."
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
          )}
        </>
      )}

      {activeExercise && (
        <ExerciseOverlay
          activeExercise={activeExercise}
          activeExerciseIndex={activeExerciseIndex}
          flashcardFlipped={flashcardFlipped}
          exerciseAnswer={exerciseAnswer}
          exerciseFeedback={exerciseFeedback}
          exerciseChecking={exerciseChecking}
          onClose={closeExerciseMode}
          onMove={moveExercise}
          onFlip={() => setFlashcardFlipped((prev) => !prev)}
          onAnswerChange={setExerciseAnswer}
          onCheck={handleCheckExercise}
        />
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes overlayFade {
          0% { opacity: 0; }
          15% { opacity: 1; }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes unlockFloatOnce {
          0% { transform: translateY(0); }
          35% { transform: translateY(-12px); }
          55% { transform: translateY(-12px); }
          100% { transform: translateY(0); }
        }
        @keyframes unlockShackle {
          0% { transform: rotate(0deg) scaleX(1); }
          22% { transform: rotate(10deg) scaleX(1); }
          26% { transform: rotate(12deg) scaleX(1); }
          58% { transform: rotate(10deg) scaleX(0); }
          100% { transform: rotate(0deg) scaleX(-1); }
        }
      `}</style>
    </div>
  )
}

function UnlockPadlock() {
  return (
    <div style={s.padlockWrap} aria-hidden="true">
      <svg style={s.padlockSvg} viewBox="48 38 160 205" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="unlockBodyFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFE04D" />
            <stop offset="100%" stopColor="#C97000" />
          </linearGradient>
          <linearGradient id="unlockShackleFace" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#E09000" />
            <stop offset="45%" stopColor="#FFE566" />
            <stop offset="100%" stopColor="#E09000" />
          </linearGradient>
          <clipPath id="unlockBodyClip">
            <rect x="56" y="125" width="116" height="100" rx="16" />
          </clipPath>
        </defs>

        <g style={s.padlockShackle}>
          <path d="M76,128 L76,90 A36,36 0 0,1 148,90 L148,128" fill="none" stroke="#8B5000" strokeWidth="26" strokeLinecap="butt" />
          <path d="M76,128 L76,90 A36,36 0 0,1 148,90 L148,128" fill="none" stroke="url(#unlockShackleFace)" strokeWidth="19" strokeLinecap="butt" />
          <path d="M88,118 L88,90 A24,24 0 0,1 136,90 L136,118" fill="none" stroke="#FFE980" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
        </g>

        <rect x="56" y="130" width="116" height="100" rx="16" fill="#8B5000" />
        <rect x="56" y="125" width="116" height="100" rx="16" fill="url(#unlockBodyFace)" />
        <rect x="64" y="127" width="100" height="10" rx="6" fill="#FFF0A0" opacity="0.35" />

        <circle cx="72" cy="137" r="5" fill="#D98000" />
        <circle cx="72" cy="137" r="2.5" fill="#FFE04D" />
        <circle cx="160" cy="137" r="5" fill="#D98000" />
        <circle cx="160" cy="137" r="2.5" fill="#FFE04D" />
        <circle cx="72" cy="213" r="5" fill="#D98000" />
        <circle cx="72" cy="213" r="2.5" fill="#FFE04D" />
        <circle cx="160" cy="213" r="5" fill="#D98000" />
        <circle cx="160" cy="213" r="2.5" fill="#FFE04D" />

        <circle cx="114" cy="163" r="16" fill="#B87000" />
        <circle cx="114" cy="163" r="13" fill="#7a4500" />
        <circle cx="114" cy="160" r="8" fill="#3a2000" />
        <rect x="110" y="167" width="8" height="15" rx="3.5" fill="#3a2000" />
        <circle cx="111" cy="157" r="2.5" fill="#B87000" opacity="0.6" />

        <rect x="56" y="152" width="116" height="5" fill="#C97800" opacity="0.4" clipPath="url(#unlockBodyClip)" />
      </svg>
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

const chatMarkdownComponents = {
  p: ({ children }) => <p style={s.chatMdP}>{children}</p>,
  ul: ({ children }) => <ul style={s.chatMdList}>{children}</ul>,
  ol: ({ children }) => <ol style={s.chatMdList}>{children}</ol>,
  li: ({ children }) => <li style={s.chatMdLi}>{children}</li>,
  strong: ({ children }) => <strong style={s.chatMdStrong}>{children}</strong>,
}

function ExerciseOverlay({
  activeExercise,
  activeExerciseIndex,
  flashcardFlipped,
  exerciseAnswer,
  exerciseFeedback,
  exerciseChecking,
  onClose,
  onMove,
  onFlip,
  onAnswerChange,
  onCheck,
}) {
  const items = activeExercise.items || []
  const item = items[activeExerciseIndex] || {}
  const isFlashcards = activeExercise.mode === 'flashcards'
  const modeTitle = isFlashcards
    ? 'Fiszki'
    : activeExercise.mode === 'quickCheck'
      ? 'Szybki sprawdzian'
      : 'Praktyka'

  return (
    <div style={s.practiceOverlay}>
      <header style={s.practiceHeader}>
        <div>
          <p style={s.practiceEyebrow}>Tryb nauki</p>
          <h2 style={s.practiceTitle}>{modeTitle}</h2>
        </div>
        <button style={s.closePracticeBtn} onClick={onClose}>Zamknij</button>
      </header>

      <main style={s.practiceMain}>
        <p style={s.practiceCounter}>{activeExerciseIndex + 1}/{items.length}</p>

        {isFlashcards ? (
          <button style={s.flipArea} onClick={onFlip}>
            <div style={{ ...s.flipCard, transform: flashcardFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
              <div style={{ ...s.flipFace, ...s.flipFrontFace }}>
                <span style={s.flipLabel}>Pojęcie</span>
                <strong style={s.flipText}>{item.front}</strong>
              </div>
              <div style={{ ...s.flipFace, ...s.flipBackFace }}>
                <span style={s.flipLabel}>Wyjaśnienie</span>
                <strong style={s.flipText}>{item.back}</strong>
              </div>
            </div>
            <span style={s.flipHint}>Kliknij kartę, żeby ją obrócić</span>
          </button>
        ) : (
          <section style={s.answerPanel}>
            <p style={s.fullQuestion}>{item.question || item.prompt}</p>
            {item.hint && <p style={s.fullHint}>Wskazówka: {item.hint}</p>}
            <textarea
              style={s.answerTextarea}
              value={exerciseAnswer}
              onChange={(event) => onAnswerChange(event.target.value)}
              placeholder="Napisz swoją odpowiedź..."
              rows={7}
            />
            <button
              style={{ ...s.checkAnswerBtn, opacity: (!exerciseAnswer.trim() || exerciseChecking) ? 0.55 : 1 }}
              onClick={onCheck}
              disabled={!exerciseAnswer.trim() || exerciseChecking}
            >
              {exerciseChecking ? 'Sprawdzam...' : 'Sprawdź z AI'}
            </button>
            {exerciseFeedback && (
              <div style={exerciseFeedback.correct === true ? s.goodFeedback : exerciseFeedback.correct === false ? s.badFeedback : s.neutralFeedback}>
                <strong>{exerciseFeedback.correct === true ? 'Dobrze' : exerciseFeedback.correct === false ? 'Do poprawy' : 'Informacja'}</strong>
                <p>{exerciseFeedback.feedback}</p>
                {exerciseFeedback.suggestion && <p>{exerciseFeedback.suggestion}</p>}
              </div>
            )}
          </section>
        )}
      </main>

      <footer style={s.practiceFooter}>
        <button style={s.secondaryPracticeBtn} onClick={() => onMove(-1)} disabled={activeExerciseIndex === 0}>Poprzednie</button>
        <button style={s.primaryPracticeBtn} onClick={() => onMove(1)} disabled={activeExerciseIndex >= items.length - 1}>Następne</button>
      </footer>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #f7fbff 0%, #eef4ff 100%)', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: 'rgba(255,255,255,.84)', borderBottom: '1px solid #dbeafe', backdropFilter: 'blur(8px)' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  badge: { fontSize: 13, color: '#16a34a', fontWeight: 600 },
  main: { width: 'min(980px, calc(100% - 28px))', margin: '0 auto', padding: '28px 0 42px' },
  unlockOverlay: { minHeight: 'clamp(360px, 58vh, 540px)', display: 'grid', alignContent: 'center', justifyItems: 'center', paddingTop: 34, textAlign: 'center', animation: 'overlayFade 1.9s ease forwards' },
  unlockCore: { width: 176, height: 176, borderRadius: 999, background: 'radial-gradient(circle at 50% 52%, rgba(255,229,102,.76) 0%, rgba(255,185,0,.38) 50%, rgba(255,185,0,.08) 74%, rgba(255,185,0,0) 88%)', boxShadow: '0 0 58px rgba(255,185,0,.24)', display: 'grid', placeItems: 'center', overflow: 'hidden' },
  padlockWrap: { transform: 'translateY(8px)', animation: 'unlockFloatOnce 1.3s cubic-bezier(0.45, 0, 0.55, 1) forwards' },
  padlockSvg: { width: 96, height: 114, overflow: 'visible', transform: 'translate(6px, 12px)', filter: 'drop-shadow(0 8px 16px rgba(255,185,0,0.2))' },
  padlockShackle: { transformOrigin: '148px 128px', transform: 'rotate(0deg) scaleX(1)', animation: 'unlockShackle .85s cubic-bezier(0.4, 0, 0.2, 1) .2s forwards' },
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
  flashcardPreview: { minHeight: 132, border: '1px solid #bfdbfe', borderRadius: 14, background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)', padding: 15, display: 'grid', alignContent: 'space-between', gap: 10 },
  flashFront: { margin: 0, fontSize: 16, fontWeight: 850, color: '#1d4ed8', lineHeight: 1.35 },
  flashBack: { margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.55 },
  practiceList: { display: 'grid', gap: 10 },
  practiceItem: { border: '1px solid #e2e8f0', borderRadius: 13, background: '#ffffff', padding: '13px 14px' },
  practiceQuestion: { margin: 0, fontSize: 15, fontWeight: 750, color: '#0f172a', lineHeight: 1.55 },
  practiceAnswer: { margin: '7px 0 0', fontSize: 14, color: '#64748b', lineHeight: 1.5 },
  startModeBtn: { justifySelf: 'start', border: 'none', borderRadius: 12, background: '#2563eb', color: '#fff', padding: '11px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer' },
  chatFab: { position: 'fixed', right: 24, bottom: 24, zIndex: 35, width: 64, height: 64, borderRadius: 999, border: '1px solid rgba(255,255,255,.55)', background: 'linear-gradient(145deg, #2563eb, #0f172a)', color: '#fff', fontSize: 25, cursor: 'pointer', boxShadow: '0 18px 42px rgba(37,99,235,.38)' },
  chatWidget: { position: 'fixed', right: 24, bottom: 24, zIndex: 40, width: 'min(480px, calc(100vw - 28px))', height: 'min(720px, calc(100vh - 34px))', background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 24, boxShadow: '0 30px 86px rgba(15,23,42,.26)', display: 'grid', gridTemplateRows: 'auto auto 1fr auto', overflow: 'hidden' },
  chatWidgetHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 14, padding: '20px 20px 18px', borderBottom: '1px solid #dbeafe', background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 78%)' },
  chatWidgetEyebrow: { margin: '0 0 5px', fontSize: 11, color: '#2563eb', fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase' },
  chatWidgetTitle: { margin: 0, fontSize: 18, color: '#0f172a', fontWeight: 900, lineHeight: 1.25 },
  chatWidgetSubTitle: { margin: '7px 0 0', fontSize: 13, color: '#64748b', lineHeight: 1.45 },
  chatCloseBtn: { flexShrink: 0, border: '1px solid #dbeafe', background: 'rgba(255,255,255,.86)', color: '#475569', borderRadius: 999, width: 36, height: 36, cursor: 'pointer', fontSize: 23, lineHeight: 1, fontWeight: 500 },
  suggestionsWrap: { padding: '14px 16px 16px', display: 'grid', gap: 9, borderBottom: '1px solid #e2e8f0', background: '#fbfdff' },
  suggestionsLabel: { margin: '0 0 2px', fontSize: 12, fontWeight: 850, color: '#475569' },
  suggestionChip: { textAlign: 'left', border: '1px solid #dbeafe', background: '#ffffff', borderRadius: 14, padding: '10px 12px', fontSize: 13, color: '#1e3a8a', lineHeight: 1.38, cursor: 'pointer', display: 'grid', gridTemplateColumns: '26px 1fr', alignItems: 'center', gap: 8, boxShadow: '0 4px 12px rgba(37,99,235,.05)' },
  suggestionNumber: { width: 24, height: 24, borderRadius: 999, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 },
  chatMessages: { display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', minHeight: 0, margin: 0, padding: '18px 16px', background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' },
  bubble: { padding: '12px 15px', borderRadius: 16, fontSize: 14, maxWidth: '82%', lineHeight: 1.55, boxShadow: '0 6px 18px rgba(15,23,42,.06)' },
  chatMdP: { margin: 0, lineHeight: 1.58 },
  chatMdList: { margin: '6px 0 0', paddingLeft: 20, display: 'grid', gap: 5 },
  chatMdLi: { lineHeight: 1.5 },
  chatMdStrong: { fontWeight: 850 },
  chatInputRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, padding: 14, borderTop: '1px solid #e2e8f0', background: '#ffffff' },
  chatInput: { minWidth: 0, padding: '13px 14px', fontSize: 14, border: '1px solid #cbd5e1', borderRadius: 14, outline: 'none', background: '#f8fafc' },
  sendBtn: { padding: '0 18px', minHeight: 46, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 14, cursor: 'pointer', fontWeight: 850, fontSize: 14 },
  mdH2: { margin: '22px 0 12px', paddingTop: 4, fontSize: 23, lineHeight: 1.2, fontWeight: 800, color: '#0f172a' },
  mdH3: { margin: '15px 0 8px', fontSize: 18, lineHeight: 1.25, fontWeight: 700, color: '#1e293b' },
  mdP: { margin: 0, fontSize: 17, lineHeight: 1.78, color: '#334155' },
  mdList: { margin: 0, paddingLeft: 26, display: 'grid', gap: 8 },
  mdLi: { fontSize: 17, lineHeight: 1.72, color: '#334155' },
  mdStrong: { fontWeight: 850, color: '#1e293b' },
  mdSpacer: { height: 8 },
  practiceOverlay: { position: 'fixed', inset: 0, zIndex: 50, background: 'linear-gradient(180deg, #f8fbff 0%, #eaf2ff 100%)', display: 'grid', gridTemplateRows: 'auto 1fr auto' },
  practiceHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '22px min(5vw, 42px)', background: 'rgba(255,255,255,.88)', borderBottom: '1px solid #dbeafe', backdropFilter: 'blur(10px)' },
  practiceEyebrow: { margin: '0 0 4px', fontSize: 11, color: '#2563eb', fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase' },
  practiceTitle: { margin: 0, fontSize: 'clamp(26px, 4vw, 38px)', fontWeight: 900, color: '#0f172a' },
  closePracticeBtn: { border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', color: '#334155', padding: '10px 14px', fontWeight: 800, cursor: 'pointer' },
  practiceMain: { width: 'min(900px, calc(100% - 28px))', margin: '0 auto', padding: '26px 0', display: 'grid', alignContent: 'center', gap: 14 },
  practiceCounter: { justifySelf: 'center', margin: 0, color: '#64748b', fontSize: 14, fontWeight: 800 },
  flipArea: { border: 'none', background: 'transparent', cursor: 'pointer', display: 'grid', gap: 14, justifyItems: 'center', perspective: 1200 },
  flipCard: { width: 'min(620px, 100%)', minHeight: 340, position: 'relative', transformStyle: 'preserve-3d', transition: 'transform .55s ease' },
  flipFace: { position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 24, border: '1px solid #bfdbfe', boxShadow: '0 22px 54px rgba(37,99,235,.16)', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 12, padding: 28, textAlign: 'center' },
  flipFrontFace: { background: 'linear-gradient(145deg, #ffffff 0%, #eff6ff 100%)' },
  flipBackFace: { background: 'linear-gradient(145deg, #ecfdf5 0%, #ffffff 100%)', transform: 'rotateY(180deg)' },
  flipLabel: { fontSize: 12, fontWeight: 900, color: '#2563eb', letterSpacing: '.08em', textTransform: 'uppercase' },
  flipText: { fontSize: 'clamp(26px, 5vw, 44px)', lineHeight: 1.14, color: '#0f172a' },
  flipHint: { fontSize: 13, color: '#64748b', fontWeight: 700 },
  answerPanel: { background: '#fff', border: '1px solid #cfe1ff', borderRadius: 22, boxShadow: '0 20px 50px rgba(37,99,235,.12)', padding: '24px', display: 'grid', gap: 14 },
  fullQuestion: { margin: 0, fontSize: 'clamp(22px, 3vw, 31px)', lineHeight: 1.28, color: '#0f172a', fontWeight: 850 },
  fullHint: { margin: 0, color: '#64748b', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 12px', fontSize: 14, lineHeight: 1.5 },
  answerTextarea: { width: '100%', boxSizing: 'border-box', border: '1px solid #bfdbfe', borderRadius: 14, padding: '13px 14px', fontSize: 16, lineHeight: 1.55, resize: 'vertical', outline: 'none', fontFamily: 'sans-serif', background: '#f8fbff' },
  checkAnswerBtn: { border: 'none', borderRadius: 13, background: '#2563eb', color: '#fff', padding: '13px 16px', fontSize: 15, fontWeight: 850, cursor: 'pointer' },
  goodFeedback: { border: '1px solid #86efac', borderRadius: 14, background: '#dcfce7', color: '#166534', padding: '12px 14px', lineHeight: 1.55 },
  badFeedback: { border: '1px solid #fecaca', borderRadius: 14, background: '#fef2f2', color: '#991b1b', padding: '12px 14px', lineHeight: 1.55 },
  neutralFeedback: { border: '1px solid #bfdbfe', borderRadius: 14, background: '#eff6ff', color: '#1e40af', padding: '12px 14px', lineHeight: 1.55 },
  practiceFooter: { display: 'flex', justifyContent: 'center', gap: 10, padding: '18px min(5vw, 42px)', background: 'rgba(255,255,255,.88)', borderTop: '1px solid #dbeafe' },
  secondaryPracticeBtn: { border: '1px solid #cbd5e1', borderRadius: 12, background: '#fff', color: '#334155', padding: '11px 16px', fontWeight: 800, cursor: 'pointer' },
  primaryPracticeBtn: { border: 'none', borderRadius: 12, background: '#0f172a', color: '#fff', padding: '11px 16px', fontWeight: 800, cursor: 'pointer' },
  hint: { color: '#9ca3af', fontSize: 14, padding: 32 },
}
