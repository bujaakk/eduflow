import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { CheckCircle2, Clock3, Lock, LogOut, UserRound } from 'lucide-react'
import { db, auth } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useEnvironment } from '../../contexts/EnvironmentContext'
import { classSubjects, normalizeSubjectKey } from '../../utils/classModel'
import completedLessonsImg from '../../assets/metric-completed-lessons.png'
import studentActivityImg from '../../assets/metric-student-activity.png'
import learningGapsImg from '../../assets/metric-learning-gaps.png'

const toDateValue = (value) => {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value instanceof Date) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
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

const lessonToUnix = (lesson) => resolveLessonDate(lesson)?.getTime() ?? 0

const formatDisplayTitle = (title, number) => {
  const cleanTitle = typeof title === 'string' ? title.trim() : ''
  if (!cleanTitle) return `Lekcja ${number}`
  if (/^lekcja\s+\d+\s*-\s+/i.test(cleanTitle)) return cleanTitle
  return `Lekcja ${number} - ${cleanTitle}`
}

const isMaterialLesson = (lesson) => {
  const type = String(lesson?.type || '').toLowerCase()
  const source = String(lesson?.source || '').toLowerCase()
  const category = String(lesson?.category || '').toLowerCase()
  return (
    category.includes('material')
    || type.includes('additional_material')
    || type.includes('material')
    || source.includes('pdf_material')
    || source.includes('additional_material')
  )
}

const resolveRowSubject = (row, classInfo) => {
  const direct = String(row?.classSubject || row?.subject || row?.subjectName || '').trim()
  if (direct) return direct
  const subjects = classSubjects(classInfo)
  if (subjects.length === 1) return subjects[0].name
  return 'Inne'
}

export default function StudentDashboard() {
  const { user } = useAuth()
  const { buildPath } = useEnvironment()
  const navigate = useNavigate()
  const [studentData, setStudentData] = useState(null)
  const [classData, setClassData] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [tasks, setTasks] = useState([])
  const [lessons, setLessons] = useState({})
  const [classLessons, setClassLessons] = useState([])
  const [classMaterials, setClassMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeStudyTab, setActiveStudyTab] = useState('lessons')
  const [activeSubjectFilter, setActiveSubjectFilter] = useState('')

  useEffect(() => {
    if (!user) return

    let unsubTasks = null
    let unsubClassLessons = null
    let unsubClassMaterials = null

    const fetchBase = async () => {
      const studentSnap = await getDoc(doc(db, 'students', user.uid))
      if (!studentSnap.exists()) {
        setLoading(false)
        return
      }
      const student = studentSnap.data()
      setStudentData(student)

      const classSnap = await getDoc(doc(db, 'classes', student.classId))
      if (classSnap.exists()) {
        const cls = classSnap.data()
        setClassData({ id: classSnap.id, ...cls })

        const teacherIds = [
          cls.teacherId,
          cls.homeroomTeacherId,
          ...(Array.isArray(cls.subjects) ? cls.subjects.map((subject) => subject?.teacherId) : []),
        ]
          .map((value) => String(value || '').trim())
          .filter(Boolean)

        if (teacherIds.length > 0) {
          const uniqueTeacherIds = [...new Set(teacherIds)]
          const teacherDocs = await Promise.all(uniqueTeacherIds.map((teacherId) => getDoc(doc(db, 'teachers', teacherId))))
          const teacherRows = teacherDocs
            .filter((teacherSnap) => teacherSnap.exists())
            .map((teacherSnap) => ({ id: teacherSnap.id, ...teacherSnap.data() }))
          setTeachers(teacherRows)
        } else {
          setTeachers([])
        }
      }

      // Real-time: wszystkie lekcje klasy (także te bez wygenerowanych tasków)
      const lessonsQ = query(collection(db, 'lessons'), where('classId', '==', student.classId))
      unsubClassLessons = onSnapshot(lessonsQ, (snap) => {
        const classLessonRows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0))
        setClassLessons(classLessonRows)
      })

      const materialsQ = query(collection(db, 'materials'), where('classId', '==', student.classId))
      unsubClassMaterials = onSnapshot(materialsQ, (snap) => {
        const materialRows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => ((b.timestamp || b.createdAt)?.seconds ?? 0) - ((a.timestamp || a.createdAt)?.seconds ?? 0))
        setClassMaterials(materialRows)
      })

      // Real-time listener na zadaniach ucznia
      const q = query(collection(db, 'tasks'), where('studentId', '==', user.uid))
      unsubTasks = onSnapshot(q, async (snap) => {
        const tasksData = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setTasks(tasksData)

        // Pobierz lekcje dla tych zadań
        const lessonIds = [...new Set(tasksData.map(t => t.lessonId))]
        const lessonMap = {}
        await Promise.all(lessonIds.map(async lid => {
          const lSnap = await getDoc(doc(db, 'lessons', lid))
          if (lSnap.exists()) lessonMap[lid] = { id: lSnap.id, ...lSnap.data() }
        }))
        setLessons(lessonMap)
        setLoading(false)
      })
    }
    fetchBase()

    return () => {
      if (typeof unsubTasks === 'function') unsubTasks()
      if (typeof unsubClassLessons === 'function') unsubClassLessons()
      if (typeof unsubClassMaterials === 'function') unsubClassMaterials()
    }
  }, [user])

  const handleLogout = async () => {
    await signOut(auth)
    navigate(buildPath('/login'))
  }

  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const locked = tasks.filter(t => t.status === 'locked').length

  const statusLabel = { locked: 'Zablokowana', in_progress: 'W trakcie', done: 'Zaliczona' }
  const statusColor = { locked: '#6b7280', in_progress: '#f59e0b', done: '#22c55e' }
  const statusBadge = { locked: 'badge-locked', in_progress: 'badge-progress', done: 'badge-done' }
  const statusIcon = { locked: Lock, in_progress: Clock3, done: CheckCircle2 }

  const taskByLessonId = {}
  tasks.forEach((t) => {
    if (t.lessonId) taskByLessonId[t.lessonId] = t
  })

  const studentFirstName =
    String(studentData?.firstName || '').trim()
    || String(user?.displayName || '').trim().split(' ')[0]
    || 'uczniu'

  const fallbackLessons = Object.values(lessons)
  const visibleLessons = classLessons.length > 0 ? classLessons : fallbackLessons
  const lessonRows = visibleLessons.filter((lesson) => !isMaterialLesson(lesson))
  const lessonMaterialRows = visibleLessons.filter((lesson) => isMaterialLesson(lesson))
  const materialRows = [...classMaterials, ...lessonMaterialRows]
  const hiddenSubjectKeys = new Set(['wychowawca'])
  const classSubjectNames = classSubjects(classData)
    .map((subject) => String(subject?.name || '').trim())
    .filter((name) => name && !hiddenSubjectKeys.has(normalizeSubjectKey(name)))
  const subjectNames = [...new Set([
    ...classSubjectNames,
    ...lessonRows.map((row) => resolveRowSubject(row, classData)),
    ...materialRows.map((row) => resolveRowSubject(row, classData)),
  ]
    .map((name) => String(name || '').trim())
    .filter((name) => name && !hiddenSubjectKeys.has(normalizeSubjectKey(name))))]
  const firstSubjectKey = subjectNames[0] ? normalizeSubjectKey(subjectNames[0]) : ''
  const effectiveSubjectFilter = activeSubjectFilter || firstSubjectKey

  useEffect(() => {
    if (subjectNames.length === 0) {
      if (activeSubjectFilter) setActiveSubjectFilter('')
      return
    }
    const exists = subjectNames.some((name) => normalizeSubjectKey(name) === activeSubjectFilter)
    if (!exists) setActiveSubjectFilter(normalizeSubjectKey(subjectNames[0]))
  }, [activeSubjectFilter, subjectNames])

  const filteredLessonRows = lessonRows.filter((row) => {
    if (!effectiveSubjectFilter) return true
    const rowSubjectKey = normalizeSubjectKey(resolveRowSubject(row, classData))
    if (hiddenSubjectKeys.has(rowSubjectKey)) return false
    return rowSubjectKey === effectiveSubjectFilter
  })
  const filteredMaterialRows = materialRows.filter((row) => {
    if (!effectiveSubjectFilter) return true
    const rowSubjectKey = normalizeSubjectKey(resolveRowSubject(row, classData))
    if (hiddenSubjectKeys.has(rowSubjectKey)) return false
    return rowSubjectKey === effectiveSubjectFilter
  })
  const selectedSubjectName = subjectNames.find((name) => normalizeSubjectKey(name) === effectiveSubjectFilter) || 'Wybrany przedmiot'
  const selectedSubjectLabel = selectedSubjectName || 'wybranego przedmiotu'

  const numberedLessonIds = [...filteredLessonRows]
    .sort((a, b) => lessonToUnix(a) - lessonToUnix(b))
    .reduce((acc, lesson, index) => {
      acc[lesson.id] = index + 1
      return acc
    }, {})

  return (
    <div className="app-shell">
      <header className="app-header">
        <Logo height={26} />
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={() => navigate(buildPath('/student/profile'))}>
            <UserRound size={16} />
            Mój profil
          </button>
          <button className="btn btn-ghost" onClick={handleLogout}>
            <LogOut size={16} />
            Wyloguj
          </button>
        </div>
      </header>

      <main className="app-main">
        <section className="hero-panel student-hero-panel">
          <div>
            <p className="eyebrow">Panel ucznia</p>
            <h1 className="page-title">Cześć, {studentFirstName}!</h1>
            <p className="page-subtitle">
              {classData?.name ?? '—'} · {teachers[0]
                ? teachers
                  .map((teacher) => `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim() || teacher.email)
                  .filter(Boolean)
                  .join(', ')
                : '—'}
            </p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-light" onClick={() => navigate(buildPath('/student/profile'))}>
              <UserRound size={17} />
              Zobacz profil
            </button>
          </div>
        </section>

        <div className="stats-grid">
          <div className="ui-card stat-card">
            <img src={completedLessonsImg} alt="" style={s.statArt} loading="lazy" />
            <span className="stat-value" style={{ color: 'var(--color-done)' }}>{done}</span>
            <span className="stat-label">Zaliczone lekcje</span>
          </div>
          <div className="ui-card stat-card">
            <img src={studentActivityImg} alt="" style={s.statArt} loading="lazy" />
            <span className="stat-value" style={{ color: 'var(--color-in-progress)' }}>{inProgress}</span>
            <span className="stat-label">W trakcie</span>
          </div>
          <div className="ui-card stat-card">
            <img src={learningGapsImg} alt="" style={s.statArt} loading="lazy" />
            <span className="stat-value" style={{ color: 'var(--color-locked)' }}>{locked}</span>
            <span className="stat-label">Czekające</span>
          </div>
        </div>

        <div style={s.subjectTabs}>
          {subjectNames.map((subjectName) => {
            const key = normalizeSubjectKey(subjectName)
            return (
              <button
                key={key}
                style={effectiveSubjectFilter === key ? s.subjectTabActive : s.subjectTab}
                onClick={() => setActiveSubjectFilter(key)}
              >
                {subjectName}
              </button>
            )
          })}
        </div>

        <div style={s.studyTabs}>
          <button
            style={activeStudyTab === 'lessons' ? s.studyTabActive : s.studyTab}
            onClick={() => setActiveStudyTab('lessons')}
          >
            Lekcje
          </button>
          <button
            style={activeStudyTab === 'materials' ? s.studyTabActive : s.studyTab}
            onClick={() => setActiveStudyTab('materials')}
          >
            Materiały
          </button>
        </div>

        {loading ? (
          <div className="ui-card loading-panel" aria-label="Ładowanie lekcji">
            <div className="loading-title" />
            <div className="loading-row">
              <div className="loading-line w-85" />
              <div className="loading-line w-55" />
              <div className="loading-line w-70" />
            </div>
          </div>
        ) : (
          <>
            <section className="ui-card" style={s.subjectHeaderCard}>
              <p style={s.subjectHeaderEyebrow}>Wybrany przedmiot</p>
              <h2 style={s.subjectHeaderTitle}>{selectedSubjectName}</h2>
            </section>

            {activeStudyTab === 'lessons' ? (
              <section>
                <h3 style={s.sectionHeading}>Lekcje</h3>
                {filteredLessonRows.length === 0 ? (
                  <div className="ui-card" style={s.emptyColumn}>
                    <p style={s.emptyTitle}>Brak lekcji dla {selectedSubjectLabel}</p>
                    <p style={s.emptyText}>Gdy nauczyciel doda lekcję do tego przedmiotu, pojawi się tutaj.</p>
                  </div>
                ) : (
                  <div className="stack-list">
                    {filteredLessonRows.map((lesson) => {
                      const task = taskByLessonId[lesson.id]
                      const lessonNumber = numberedLessonIds[lesson.id] ?? 1
                      const displayTitle = formatDisplayTitle(lesson?.title, lessonNumber)
                      const displayDate = resolveLessonDate(lesson)
                      const lessonSubject = resolveRowSubject(lesson, classData)
                      const hasTask = Boolean(task)
                      const quizCompleted = task?.quizStatus === 'completed' || task?.status === 'done'
                      const noteUnlocked = task?.noteUnlocked === true || quizCompleted
                      const exercisesUnlocked = task?.exercisesUnlocked === true

                      let phase = 'locked'
                      if (hasTask && !quizCompleted) phase = 'quiz'
                      if (hasTask && noteUnlocked) phase = exercisesUnlocked ? 'exercises' : 'note'

                      const phaseMeta = {
                        locked: { label: 'Czeka na quiz', color: '#64748b', badge: 'badge-locked', icon: Lock },
                        quiz: { label: 'Najpierw quiz', color: '#f59e0b', badge: 'badge-progress', icon: Clock3 },
                        note: { label: 'Notatka odblokowana', color: '#22c55e', badge: 'badge-done', icon: CheckCircle2 },
                        exercises: { label: 'Ćwiczenia odblokowane', color: '#16a34a', badge: 'badge-done', icon: CheckCircle2 },
                      }
                      const meta = phaseMeta[phase]
                      const isLocked = phase === 'locked'
                      const StatusIcon = meta.icon

                      const handleCardOpen = () => {
                        if (!hasTask) return
                        if (!quizCompleted) {
                          navigate(buildPath(`/student/lesson/${task.id}`))
                          return
                        }
                        if (noteUnlocked) {
                          navigate(buildPath(`/student/note/${task.id}`))
                        }
                      }

                      return (
                        <div
                          key={lesson.id}
                          style={{
                            opacity: isLocked ? 0.6 : 1,
                            cursor: isLocked ? 'not-allowed' : 'pointer',
                            borderLeft: `4px solid ${meta.color}`,
                          }}
                          className="ui-card lesson-card"
                          onClick={handleCardOpen}
                        >
                          <div className={`badge ${meta.badge}`}>
                            <StatusIcon size={14} />
                            {meta.label}
                          </div>
                          <div className="card-title" style={{ marginTop: 14 }}>{displayTitle}</div>
                          <div className="card-meta">
                            {displayDate
                              ? displayDate.toLocaleDateString('pl-PL', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                              : '—'}
                          </div>
                          <div className="card-meta" style={{ marginTop: 6 }}>Przedmiot: {lessonSubject}</div>
                          {task?.status === 'in_progress' && (
                            <div className="progress-track">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${Math.min(100, Math.round(((task.answeredCount ?? 0) / (task.questions?.length ?? 1)) * 100))}%`,
                                }}
                              />
                            </div>
                          )}
                          {hasTask && (
                            <div className="card-meta" style={{ marginTop: 8 }}>
                              {noteUnlocked ? 'Notatka: odblokowana' : 'Notatka: zablokowana do czasu ukończenia quizu'}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            ) : (
              <section>
                <h3 style={s.sectionHeading}>Materiały</h3>
                {filteredMaterialRows.length === 0 ? (
                  <div className="ui-card" style={s.emptyColumn}>
                    <p style={s.emptyTitle}>Brak materiałów dla {selectedSubjectLabel}</p>
                    <p style={s.emptyText}>Gdy nauczyciel wrzuci materiał dla tego przedmiotu, pojawi się tutaj.</p>
                  </div>
                ) : (
                  <div className="stack-list">
                    {filteredMaterialRows.map((material) => {
                      const displayDate = resolveLessonDate(material)
                      const isProcessing = material.processingStatus === 'processing' || material.status === 'processing'
                      const materialSubject = resolveRowSubject(material, classData)
                      return (
                        <div
                          key={material.id}
                          className="ui-card lesson-card"
                          style={{ cursor: 'pointer', borderLeft: '4px solid #0ea5e9' }}
                          onClick={() => navigate(buildPath(`/student/material/${material.id}`))}
                        >
                          <div className="badge badge-progress" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                            {isProcessing ? 'AI przygotowuje' : 'Materiał PDF'}
                          </div>
                          <div className="card-title" style={{ marginTop: 14 }}>{material.title || material.shortTitle || 'Materiał dodatkowy'}</div>
                          <div className="card-meta">
                            {displayDate
                              ? displayDate.toLocaleDateString('pl-PL', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                              })
                              : '—'}
                          </div>
                          <div className="card-meta" style={{ marginTop: 8 }}>
                            {isProcessing ? 'AI skraca i opisuje materiał z PDF' : (material.description || 'Otwórz notatkę z materiału')}
                          </div>
                          <div className="card-meta" style={{ marginTop: 6 }}>Przedmiot: {materialSubject}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  subjectTabs: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    margin: '14px 0 12px',
    padding: '4px 2px 4px',
    alignItems: 'center',
  },
  subjectTab: { border: '1px solid #cbd5e1', borderRadius: 999, background: '#fff', color: '#334155', padding: '8px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' },
  subjectTabActive: { border: '1px solid #2563eb', borderRadius: 999, background: '#dbeafe', color: '#1d4ed8', padding: '8px 14px', cursor: 'pointer', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap', boxShadow: '0 6px 14px rgba(37,99,235,.16)' },
  studyTabs: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '0 0 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 12, padding: 4, width: '100%' },
  studyTab: { border: 'none', borderRadius: 9, background: 'transparent', color: '#475569', padding: '10px 14px', cursor: 'pointer', fontWeight: 800, fontSize: 14 },
  studyTabActive: { border: 'none', borderRadius: 9, background: '#2563eb', color: '#fff', padding: '10px 14px', cursor: 'pointer', fontWeight: 800, fontSize: 14, boxShadow: '0 8px 16px rgba(37,99,235,.24)' },
  subjectHeaderCard: { marginBottom: 14, padding: 14, border: '1px solid #dbeafe', background: '#f8fbff' },
  subjectHeaderEyebrow: { margin: 0, color: '#64748b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' },
  subjectHeaderTitle: { margin: '6px 0 0', color: '#0f172a', fontSize: 26, fontWeight: 900 },
  sectionHeading: { fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 10px' },
  emptyColumn: { border: '1px dashed #cbd5e1', borderRadius: 12, padding: '16px 14px', background: '#f8fafc' },
  emptyTitle: { margin: 0, color: '#0f172a', fontSize: 15, fontWeight: 800 },
  emptyText: { margin: '7px 0 0', color: '#64748b', fontSize: 13, lineHeight: 1.45 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  logo: { fontSize: 20, fontWeight: 700, color: '#2563eb' },
  logoutBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, color: '#6b7280' },
  profileBtn: { background: 'none', border: '1px solid #bfdbfe', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, color: '#2563eb', fontWeight: 500 },
  main: { maxWidth: 800, margin: '0 auto', padding: '32px 24px' },
  welcomeRow: { marginBottom: 24 },
  welcome: { fontSize: 26, fontWeight: 700, color: '#111827', marginBottom: 4 },
  classBadge: { fontSize: 14, color: '#6b7280' },
  statsRow: { display: 'flex', gap: 16, marginBottom: 36 },
  statCard: { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px', textAlign: 'center' },
  statNum: { display: 'block', fontSize: 28, fontWeight: 700, color: '#22c55e' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 4, display: 'block' },
  sectionTitle: { fontSize: 18, fontWeight: 600, color: '#111827', marginBottom: 16 },
  lessonGrid: { display: 'flex', flexDirection: 'column', gap: 12 },
  lessonCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '18px 20px' },
  lessonStatus: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  statusText: { fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  lessonTitle: { fontSize: 16, fontWeight: 600, color: '#111827', marginBottom: 4 },
  lessonMeta: { fontSize: 12, color: '#9ca3af' },
  progressBar: { marginTop: 10, height: 4, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#f59e0b', borderRadius: 4, transition: 'width 0.3s' },
  hint: { color: '#9ca3af', fontSize: 14 },
  statArt: { width: 50, height: 50, objectFit: 'contain', float: 'right', marginLeft: 8, marginBottom: 8 },
}
