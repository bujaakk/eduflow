import Logo from '../../components/Logo'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../../firebase'
import IllustrationState from '../../components/IllustrationState'

const toDateValue = (value) => {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000)
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

const formatDateTime = (value) => {
  const date = toDateValue(value)
  if (!date) return '—'
  return date.toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const resolveLessonDate = (lesson) => {
  if (!lesson || typeof lesson !== 'object') return null
  return toDateValue(
    lesson.timestamp
    || lesson.date
    || lesson.lessonDate
    || lesson.createdAt
    || lesson.created_at
  )
}

const formatDisplayTitle = (title, number) => {
  const cleanTitle = typeof title === 'string' ? title.trim() : ''
  if (!cleanTitle) return number ? `Lekcja ${number}` : 'Lekcja'
  if (/^lekcja\s+\d+\s*-\s+/i.test(cleanTitle)) return cleanTitle
  if (number) return `Lekcja ${number} - ${cleanTitle}`
  return cleanTitle
}

const normalizeQuizDraft = (items) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

const pickString = (...values) => {
  const hit = values.find((v) => typeof v === 'string' && v.trim())
  return hit ? hit.trim() : ''
}

const pickArray = (...values) => {
  const hit = values.find((v) => Array.isArray(v) && v.length > 0)
  return hit || []
}

const renderBold = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part
  ))
}

const renderMarkdown = (text) => {
  if (!text?.trim()) return <p style={{ color: '#64748b' }}>Brak notatki dla tej lekcji.</p>
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i} style={s.mdH2}>{line.slice(3)}</h2>
    if (line.startsWith('### ')) return <h3 key={i} style={s.mdH3}>{line.slice(4)}</h3>
    if (line.startsWith('- ')) return <li key={i} style={s.mdLi}>{renderBold(line.slice(2))}</li>
    if (!line.trim()) return <br key={i} />
    return <p key={i} style={s.mdP}>{renderBold(line)}</p>
  })
}

export default function LessonProfile() {
  const { lessonId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lesson, setLesson] = useState(null)
  const [classInfo, setClassInfo] = useState(null)
  const [tasks, setTasks] = useState([])
  const [students, setStudents] = useState({})
  const [analytics, setAnalytics] = useState(null)
  const [lessonNumber, setLessonNumber] = useState(null)
  const [isQuizEditing, setIsQuizEditing] = useState(false)
  const [quizDraft, setQuizDraft] = useState([])
  const [quizSaving, setQuizSaving] = useState(false)
  const [quizError, setQuizError] = useState('')
  const [quizInfo, setQuizInfo] = useState('')
  const [summaryDraft, setSummaryDraft] = useState('')
  const [summarySaving, setSummarySaving] = useState(false)
  const [summaryInfo, setSummaryInfo] = useState('')
  const [summaryError, setSummaryError] = useState('')

  useEffect(() => {
    if (!lessonId) return

    const fetchData = async () => {
      setLoading(true)
      setError('')
      try {
        const lessonSnap = await getDoc(doc(db, 'lessons', lessonId))
        if (!lessonSnap.exists()) {
          setError('Nie znaleziono tej lekcji.')
          setLoading(false)
          return
        }

        const lessonData = { id: lessonSnap.id, ...lessonSnap.data() }
        setLesson(lessonData)

        let classStudentIdsLocal = []
        if (lessonData.classId) {
          const classSnap = await getDoc(doc(db, 'classes', lessonData.classId))
          if (classSnap.exists()) {
            const classData = { id: classSnap.id, ...classSnap.data() }
            setClassInfo(classData)
            classStudentIdsLocal = Array.isArray(classData.studentIds) ? classData.studentIds : []
          }

          const classLessonsSnap = await getDocs(query(collection(db, 'lessons'), where('classId', '==', lessonData.classId)))
          const orderedClassLessons = classLessonsSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => {
              const aDate = resolveLessonDate(a)?.getTime() ?? 0
              const bDate = resolveLessonDate(b)?.getTime() ?? 0
              return aDate - bDate
            })
          const indexInClass = orderedClassLessons.findIndex((item) => item.id === lessonId)
          setLessonNumber(indexInClass >= 0 ? indexInClass + 1 : null)
        }

        const linkedTasks = []

        const directTasksSnap = await getDocs(query(collection(db, 'tasks'), where('lessonId', '==', lessonId)))
        linkedTasks.push(...directTasksSnap.docs.map((d) => ({ id: d.id, ...d.data() })))

        // Fallback: sometimes workflows store alternative lesson references.
        if (lessonData.classId) {
          const classTasksSnap = await getDocs(query(collection(db, 'tasks'), where('classId', '==', lessonData.classId)))
          const lessonIdCandidates = new Set([
            lessonId,
            lessonData.lessonId,
            lessonData.lesson_id,
            lessonData.externalLessonId,
            lessonData.lessonDocId,
          ].filter(Boolean).map((v) => String(v)))
          const lessonTitle = String(lessonData.title || '').trim().toLowerCase()

          classTasksSnap.docs.forEach((d) => {
            const data = d.data()
            const taskLessonRefs = [
              data.lessonId,
              data.lesson_id,
              data.lessonRef,
              data.lessonDocId,
              data.lessonDocumentId,
              data.lesson?.id,
            ].filter(Boolean).map((v) => String(v))
            const taskTitle = String(data.lessonTitle || data.title || '').trim().toLowerCase()
            const byId = taskLessonRefs.some((ref) => lessonIdCandidates.has(ref))
            const byTitle = lessonTitle && taskTitle && taskTitle === lessonTitle
            if (byId || byTitle) {
              linkedTasks.push({ id: d.id, ...data })
            }
          })
        }

        const uniqueTaskMap = {}
        linkedTasks.forEach((t) => { uniqueTaskMap[t.id] = t })
        const taskRows = Object.values(uniqueTaskMap)
        setTasks(taskRows)

        const studentIdsFromTasks = [...new Set(taskRows.map((t) => t.studentId).filter(Boolean))]
        const studentIds = [...new Set([...studentIdsFromTasks, ...classStudentIdsLocal])]
        const studentMap = {}
        await Promise.all(studentIds.map(async (studentId) => {
          const studentSnap = await getDoc(doc(db, 'students', studentId))
          if (!studentSnap.exists()) return
          const data = studentSnap.data()
          const name = `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim() || data.email || studentId
          studentMap[studentId] = name
        }))
        setStudents(studentMap)

        const analyticsSnap = await getDocs(query(collection(db, 'lessonAnalytics'), where('lessonId', '==', lessonId)))
        if (!analyticsSnap.empty) {
          setAnalytics({ id: analyticsSnap.docs[0].id, ...analyticsSnap.docs[0].data() })
        } else {
          setAnalytics(null)
        }
      } catch {
        setError('Nie udało się załadować profilu lekcji.')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [lessonId])

  const quizQuestions = useMemo(() => {
    const lessonQuiz = pickArray(
      lesson?.quiz,
      lesson?.quizQuestions,
      lesson?.questions,
      lesson?.generatedQuiz,
      lesson?.generated?.quiz,
      lesson?.data?.quiz,
      analytics?.quiz,
      analytics?.questions,
      analytics?.generatedQuiz
    )
    if (lessonQuiz.length > 0) return lessonQuiz

    const firstTaskWithQuestions = tasks.find((t) => Array.isArray(t.questions) && t.questions.length > 0)
    return firstTaskWithQuestions?.questions ?? []
  }, [lesson, tasks, analytics])

  const lessonNote = useMemo(() => pickString(
    lesson?.note,
    lesson?.notes,
    lesson?.lessonNote,
    lesson?.generatedNote,
    lesson?.summary,
    lesson?.transcript,
    lesson?.transkrypcja,
    lesson?.generated?.note,
    lesson?.data?.note,
    analytics?.note,
    analytics?.summary,
    analytics?.lessonNote
  ), [lesson, analytics])

  const lessonSummary = useMemo(() => pickString(
    lesson?.summary,
    lesson?.description,
    lesson?.lessonSummary,
    lesson?.generatedSummary,
    analytics?.summary
  ), [lesson, analytics])

  useEffect(() => {
    setSummaryDraft(lessonSummary)
  }, [lessonSummary])

  useEffect(() => {
    if (isQuizEditing) return
    setQuizDraft(quizQuestions.length > 0 ? quizQuestions.map((q) => String(q)) : [''])
  }, [quizQuestions, isQuizEditing])

  const stats = useMemo(() => {
    const done = tasks.filter((t) => t.status === 'done').length
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length
    const locked = tasks.filter((t) => t.status === 'locked').length
    return { done, inProgress, locked, total: tasks.length }
  }, [tasks])

  const studentRows = useMemo(() => {
    const rows = []
    const studentIds = Object.keys(students)
    if (studentIds.length > 0 && tasks.length === 0) {
      studentIds.forEach((studentId) => {
        rows.push({
          id: `fallback-${studentId}`,
          studentId,
          quizState: 'required',
          noteUnlocked: false,
          exercisesUnlocked: false,
          answered: 0,
          totalQuestions: 0,
        })
      })
      return rows
    }

    tasks.forEach((task) => {
      const totalQuestions = task.questions?.length ?? 0
      const answered = task.answeredCount ?? 0
      const quizState = task.quizStatus ?? (task.status === 'done' ? 'completed' : task.status || 'required')
      rows.push({
        id: task.id,
        studentId: task.studentId,
        quizState,
        noteUnlocked: Boolean(task.noteUnlocked),
        exercisesUnlocked: Boolean(task.exercisesUnlocked),
        answered,
        totalQuestions,
      })
    })
    return rows
  }, [tasks, students])

  const handleStartQuizEdit = () => {
    setQuizError('')
    setQuizInfo('')
    setIsQuizEditing(true)
    setQuizDraft(quizQuestions.length > 0 ? quizQuestions.map((q) => String(q)) : [''])
  }

  const handleQuizDraftChange = (index, value) => {
    setQuizDraft((prev) => prev.map((item, i) => (i === index ? value : item)))
  }

  const handleAddQuizQuestion = () => {
    setQuizDraft((prev) => [...prev, ''])
  }

  const handleRemoveQuizQuestion = (index) => {
    setQuizDraft((prev) => prev.filter((_, i) => i !== index))
  }

  const handleCancelQuizEdit = () => {
    setIsQuizEditing(false)
    setQuizError('')
    setQuizDraft(quizQuestions.length > 0 ? quizQuestions.map((q) => String(q)) : [''])
  }

  const handleSaveSummary = async () => {
    if (!lesson?.id) return
    setSummarySaving(true)
    setSummaryError('')
    setSummaryInfo('')
    try {
      const nextSummary = String(summaryDraft || '').trim()
      await updateDoc(doc(db, 'lessons', lesson.id), {
        summary: nextSummary,
        updatedAt: serverTimestamp(),
      })
      setLesson((prev) => (prev ? { ...prev, summary: nextSummary } : prev))
      setSummaryInfo('Opis lekcji zapisany.')
    } catch {
      setSummaryError('Nie udało się zapisać opisu lekcji.')
    } finally {
      setSummarySaving(false)
    }
  }

  const handleSaveQuiz = async () => {
    if (!lesson?.id) return
    const cleanedQuestions = normalizeQuizDraft(quizDraft)
    if (cleanedQuestions.length === 0) {
      setQuizError('Dodaj minimum jedno pytanie quizowe.')
      return
    }

    setQuizSaving(true)
    setQuizError('')
    setQuizInfo('')
    try {
      await updateDoc(doc(db, 'lessons', lesson.id), {
        quiz: cleanedQuestions,
        quizQuestions: cleanedQuestions,
        updatedAt: serverTimestamp(),
      })

      const lockableTasks = tasks.filter((task) => {
        const status = String(task.status || 'locked')
        return status === 'locked'
      })

      if (lockableTasks.length > 0) {
        const batch = writeBatch(db)
        lockableTasks.forEach((task) => {
          batch.update(doc(db, 'tasks', task.id), {
            questions: cleanedQuestions,
            quizStatus: 'required',
            answeredCount: 0,
            noteUnlocked: false,
            exercisesUnlocked: false,
            updatedAt: serverTimestamp(),
          })
        })
        await batch.commit()
      }

      setLesson((prev) => (prev ? {
        ...prev,
        quiz: cleanedQuestions,
        quizQuestions: cleanedQuestions,
      } : prev))
      setTasks((prev) => prev.map((task) => {
        const status = String(task.status || 'locked')
        if (status !== 'locked') return task
        return {
          ...task,
          questions: cleanedQuestions,
          quizStatus: 'required',
          answeredCount: 0,
          noteUnlocked: false,
          exercisesUnlocked: false,
        }
      }))

      setIsQuizEditing(false)
      setQuizInfo(
        lockableTasks.length > 0
          ? `Quiz zapisany. Zaktualizowano ${lockableTasks.length} nie rozpoczętych zadań uczniów.`
          : 'Quiz zapisany w lekcji.'
      )
    } catch {
      setQuizError('Nie udało się zapisać quizu.')
    } finally {
      setQuizSaving(false)
    }
  }

  if (loading) return <div style={s.loading}>Ładowanie profilu lekcji...</div>
  if (error) {
    return (
      <div style={s.page}>
        <header style={s.header}>
          <button style={s.backBtn} onClick={() => navigate(-1)}>← Wróć</button>
          <Logo height={26} />
        </header>
        <main style={s.main}>
          <div className="ui-card">
            <IllustrationState type="error" title="Błąd" text={error} />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>← Wróć</button>
        <Logo height={26} />
      </header>

      <main style={s.main}>
        <section className="hero-panel" style={s.hero}>
          <div>
            <p className="eyebrow">Profil lekcji</p>
            <h1 className="page-title" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
              {formatDisplayTitle(lesson?.title, lessonNumber)}
            </h1>
            <p className="page-subtitle">
              {classInfo?.name ? `${classInfo.name} · ` : ''}
              {classInfo?.subject ? `${classInfo.subject} · ` : ''}
              Data: {formatDateTime(resolveLessonDate(lesson))}
            </p>
          </div>
        </section>

        <div style={s.statsGrid}>
          <div className="ui-card stat-card">
            <span className="stat-value">{stats.done}</span>
            <span className="stat-label">Zaliczone</span>
          </div>
          <div className="ui-card stat-card">
            <span className="stat-value" style={{ color: '#f59e0b' }}>{stats.inProgress}</span>
            <span className="stat-label">W trakcie</span>
          </div>
          <div className="ui-card stat-card">
            <span className="stat-value" style={{ color: '#64748b' }}>{stats.locked}</span>
            <span className="stat-label">Zablokowane</span>
          </div>
        </div>

        <section className="ui-card" style={s.section}>
          <h2 style={s.sectionTitle}>Opis lekcji</h2>
          <textarea
            value={summaryDraft}
            onChange={(event) => {
              setSummaryDraft(event.target.value)
              if (summaryError) setSummaryError('')
              if (summaryInfo) setSummaryInfo('')
            }}
            style={s.summaryTextarea}
            placeholder="Dodaj krótki opis lekcji dla nauczyciela i uczniów."
            rows={4}
          />
          <div style={s.actionsRow}>
            <button
              style={s.primaryBtn}
              onClick={handleSaveSummary}
              disabled={summarySaving}
            >
              {summarySaving ? 'Zapisywanie...' : 'Zapisz opis'}
            </button>
          </div>
          {summaryError && <p style={s.errorText}>{summaryError}</p>}
          {summaryInfo && <p style={s.infoText}>{summaryInfo}</p>}
        </section>

        <section className="ui-card" style={s.section}>
          <h2 style={s.sectionTitle}>Notatka lekcji</h2>
          <div style={s.noteContent}>{renderMarkdown(lessonNote)}</div>
        </section>

        <section className="ui-card" style={s.section}>
          <h2 style={s.sectionTitle}>Quiz z lekcji</h2>
          {!isQuizEditing && quizQuestions.length === 0 && (
            <p style={s.hint}>Quiz jeszcze nie został wygenerowany.</p>
          )}

          {!isQuizEditing && quizQuestions.length > 0 && (
            <ol style={s.quizList}>
              {quizQuestions.map((question, index) => (
                <li key={`${index}-${String(question).slice(0, 16)}`} style={s.quizItem}>{String(question)}</li>
              ))}
            </ol>
          )}

          {isQuizEditing && (
            <div style={s.quizEditorWrap}>
              {quizDraft.map((question, index) => (
                <div key={`draft-${index}`} style={s.quizEditorRow}>
                  <textarea
                    value={question}
                    onChange={(event) => handleQuizDraftChange(index, event.target.value)}
                    style={s.quizTextarea}
                    rows={3}
                    placeholder={`Pytanie ${index + 1}`}
                  />
                  <button
                    style={s.removeBtn}
                    onClick={() => handleRemoveQuizQuestion(index)}
                    disabled={quizDraft.length <= 1}
                  >
                    Usuń
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={s.actionsRow}>
            {!isQuizEditing ? (
              <>
                <button style={s.primaryBtn} onClick={handleStartQuizEdit}>Edytuj quiz</button>
                <button
                  style={s.secondaryBtn}
                  onClick={() => {
                    handleStartQuizEdit()
                    setQuizDraft((prev) => [...prev, ''])
                  }}
                >
                  Dodaj pytanie
                </button>
              </>
            ) : (
              <>
                <button style={s.secondaryBtn} onClick={handleAddQuizQuestion}>+ Dodaj kolejne pytanie</button>
                <button style={s.primaryBtn} onClick={handleSaveQuiz} disabled={quizSaving}>
                  {quizSaving ? 'Zapisywanie...' : 'Zapisz quiz'}
                </button>
                <button style={s.ghostBtn} onClick={handleCancelQuizEdit} disabled={quizSaving}>Anuluj</button>
              </>
            )}
          </div>
          {quizError && <p style={s.errorText}>{quizError}</p>}
          {quizInfo && <p style={s.infoText}>{quizInfo}</p>}
        </section>

        <section className="ui-card" style={s.section}>
          <h2 style={s.sectionTitle}>Postęp uczniów</h2>
          {studentRows.length === 0 ? (
            <p style={s.hint}>Brak przypisanych zadań dla tej lekcji.</p>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Uczeń</th>
                    <th style={s.th}>Quiz</th>
                    <th style={s.th}>Notatka</th>
                    <th style={s.th}>Ćwiczenia</th>
                    <th style={s.th}>Postęp</th>
                  </tr>
                </thead>
                <tbody>
                  {studentRows.map((row) => {
                    return (
                      <tr key={row.id}>
                        <td style={s.td}>{students[row.studentId] || row.studentId}</td>
                        <td style={s.td}>{row.quizState === 'completed' ? 'Zaliczony' : row.quizState === 'in_progress' ? 'W trakcie' : 'Wymagany'}</td>
                        <td style={s.td}>{row.noteUnlocked ? 'Odblokowana' : 'Zablokowana'}</td>
                        <td style={s.td}>{row.exercisesUnlocked ? 'Odblokowane' : 'Zablokowane'}</td>
                        <td style={s.td}>{row.answered}/{row.totalQuestions || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

const s = {
  loading: { minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#64748b' },
  page: { minHeight: '100vh', background: '#f8fafc', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  main: { width: 'min(1080px, calc(100% - 32px))', margin: '0 auto', padding: '28px 0 40px' },
  hero: { marginBottom: 16 },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 },
  section: { padding: 18, marginBottom: 12 },
  sectionTitle: { margin: '0 0 12px', fontSize: 20, fontWeight: 800, color: '#0f172a' },
  summaryTextarea: {
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: '10px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
    color: '#1e293b',
  },
  actionsRow: { marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' },
  primaryBtn: {
    border: 'none',
    borderRadius: 10,
    background: '#1d4ed8',
    color: '#fff',
    fontWeight: 700,
    fontSize: 13,
    padding: '9px 14px',
    cursor: 'pointer',
  },
  secondaryBtn: {
    border: '1px solid #93c5fd',
    borderRadius: 10,
    background: '#eff6ff',
    color: '#1d4ed8',
    fontWeight: 700,
    fontSize: 13,
    padding: '9px 14px',
    cursor: 'pointer',
  },
  ghostBtn: {
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    background: '#fff',
    color: '#334155',
    fontWeight: 700,
    fontSize: 13,
    padding: '9px 14px',
    cursor: 'pointer',
  },
  quizEditorWrap: { display: 'grid', gap: 10 },
  quizEditorRow: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' },
  quizTextarea: {
    width: '100%',
    border: '1px solid #cbd5e1',
    borderRadius: 10,
    padding: '9px 11px',
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
    color: '#0f172a',
  },
  removeBtn: {
    border: '1px solid #fecaca',
    borderRadius: 8,
    background: '#fff1f2',
    color: '#b91c1c',
    fontWeight: 700,
    fontSize: 12,
    padding: '8px 10px',
    cursor: 'pointer',
  },
  noteContent: { color: '#334155', lineHeight: 1.65 },
  mdH2: { margin: '16px 0 8px', fontSize: 18, fontWeight: 800, color: '#0f172a' },
  mdH3: { margin: '12px 0 6px', fontSize: 16, fontWeight: 700, color: '#1e293b' },
  mdP: { margin: '0 0 7px', color: '#334155' },
  mdLi: { margin: '0 0 4px 18px', color: '#334155' },
  quizList: { margin: 0, paddingLeft: 20, display: 'grid', gap: 10 },
  quizItem: { color: '#0f172a', lineHeight: 1.55 },
  hint: { color: '#64748b', fontSize: 14 },
  errorText: { color: '#b91c1c', fontSize: 13, margin: '10px 0 0' },
  infoText: { color: '#0369a1', fontSize: 13, margin: '10px 0 0' },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 12, fontWeight: 700, color: '#64748b', padding: '8px 10px', borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase', letterSpacing: '.05em' },
  td: { fontSize: 14, color: '#334155', padding: '10px', borderBottom: '1px solid #f1f5f9' },
}
