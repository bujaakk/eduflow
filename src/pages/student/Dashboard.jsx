import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { CheckCircle2, Clock3, Lock, LogOut, UserRound } from 'lucide-react'
import { db, auth } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'
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

export default function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [studentData, setStudentData] = useState(null)
  const [classData, setClassData] = useState(null)
  const [teachers, setTeachers] = useState([])
  const [tasks, setTasks] = useState([])
  const [lessons, setLessons] = useState({})
  const [classLessons, setClassLessons] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return

    let unsubTasks = null
    let unsubClassLessons = null

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

        const teacherSnap = await getDoc(doc(db, 'teachers', cls.teacherId))
        if (teacherSnap.exists()) setTeachers([{ id: teacherSnap.id, ...teacherSnap.data() }])
      }

      // Real-time: wszystkie lekcje klasy (także te bez wygenerowanych tasków)
      const lessonsQ = query(collection(db, 'lessons'), where('classId', '==', student.classId))
      unsubClassLessons = onSnapshot(lessonsQ, (snap) => {
        const classLessonRows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.timestamp?.seconds ?? 0) - (a.timestamp?.seconds ?? 0))
        setClassLessons(classLessonRows)
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
    }
  }, [user])

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/login')
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
  const numberedLessonIds = [...visibleLessons]
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
          <button className="btn btn-secondary" onClick={() => navigate('/student/profile')}>
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
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Panel ucznia</p>
            <h1 className="page-title">Cześć, {studentFirstName}!</h1>
            <p className="page-subtitle">
              {classData?.name ?? '—'} · {teachers[0]
                ? `${teachers[0].firstName} ${teachers[0].lastName}`
                : '—'}
            </p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-light" onClick={() => navigate('/student/profile')}>
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

        <div className="section-bar">
          <h2 className="section-title">Moje lekcje</h2>
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
        ) : visibleLessons.length === 0 ? (
          <div className="ui-card">
            <IllustrationState
              type="noLessons"
              title="Brak lekcji do wykonania"
              text="Gdy nauczyciel doda lekcję do Twojej klasy, pojawi się tutaj karta z postępem."
            />
          </div>
        ) : (
          <div className="stack-list">
            {visibleLessons.map(lesson => {
              const task = taskByLessonId[lesson.id]
              const lessonNumber = numberedLessonIds[lesson.id] ?? 1
              const displayTitle = formatDisplayTitle(lesson?.title, lessonNumber)
              const displayDate = resolveLessonDate(lesson)
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
                  navigate(`/student/lesson/${task.id}`)
                  return
                }
                if (noteUnlocked) {
                  navigate(`/student/note/${task.id}`)
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
                  {task?.status === 'in_progress' && (
                    <div className="progress-track">
                      <div className="progress-fill" style={{
                        width: `${Math.min(100, Math.round(((task.answeredCount ?? 0) / (task.questions?.length ?? 1)) * 100))}%`
                      }} />
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
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
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
