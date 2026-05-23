import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection, query, where, getDocs, doc, getDoc
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useEnvironment } from '../../contexts/EnvironmentContext'
import IllustrationState from '../../components/IllustrationState'
import { classBelongsToTeacher, classSubjectLabel } from '../../utils/classModel'

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

const dateToUnix = (value) => toDateValue(value)?.getTime() ?? 0

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

export default function LessonList() {
  const { user, teacherProfile } = useAuth()
  const { environmentId, isDefaultEnvironment, buildPath } = useEnvironment()
  const navigate = useNavigate()
  const isEnvironmentAdmin = teacherProfile?.role === 'environment_admin'
  const [lessons, setLessons] = useState([])
  const [classes, setClasses] = useState({})
  const [expanded, setExpanded] = useState(null)
  const [details, setDetails] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchData = async () => {
      const [lessonsSnap, classesSnap] = await Promise.all([
        getDocs(query(collection(db, 'lessons'), where('teacherId', '==', user.uid))),
        getDocs(collection(db, 'classes')),
      ])

      const classMap = {}
      classesSnap.docs.forEach(d => {
        const data = d.data()
        const sameEnvironment = (data.environmentId || 'default') === (isDefaultEnvironment ? 'default' : environmentId)
        if (sameEnvironment && classBelongsToTeacher(data, user.uid, isEnvironmentAdmin)) classMap[d.id] = data
      })
      setClasses(classMap)

      const lessonList = lessonsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter((lesson) => {
          const sameEnvironment = (lesson.environmentId || 'default') === (isDefaultEnvironment ? 'default' : environmentId)
          return sameEnvironment || Boolean(classMap[lesson.classId])
        })
      lessonList.sort((a, b) => dateToUnix(b.timestamp) - dateToUnix(a.timestamp))

      // Dla każdej lekcji policz ile tasks done
      const withStats = await Promise.all(lessonList.map(async lesson => {
        const tasksSnap = await getDocs(
          query(collection(db, 'tasks'), where('lessonId', '==', lesson.id))
        )
        const all = tasksSnap.size
        const done = tasksSnap.docs.filter(d => d.data().status === 'done').length
        return { ...lesson, totalTasks: all, doneTasks: done }
      }))

      setLessons(withStats)
      setLoading(false)
    }
    fetchData()
  }, [user, environmentId, isDefaultEnvironment, isEnvironmentAdmin])

  const toggleExpand = async (lessonId) => {
    if (expanded === lessonId) { setExpanded(null); return }
    setExpanded(lessonId)

    if (details[lessonId]) return

    // Załaduj szczegóły uczniów dla tej lekcji
    const tasksSnap = await getDocs(
      query(collection(db, 'tasks'), where('lessonId', '==', lessonId))
    )
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    const studentRows = await Promise.all(tasks.map(async task => {
      let name = task.studentId
      try {
        const sdoc = await getDoc(doc(db, 'students', task.studentId))
        if (sdoc.exists()) {
          const d = sdoc.data()
          name = `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || task.studentId
        }
      } catch {}
      return { studentId: task.studentId, name, status: task.status, taskId: task.id }
    }))

    setDetails(prev => ({ ...prev, [lessonId]: studentRows }))
  }

  const formatDate = (value) => {
    const date = toDateValue(value)
    if (!date) return '—'
    return date.toLocaleString('pl-PL', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const statusLabel = { locked: '🔒 Nie zaczął', in_progress: '⏳ W trakcie', done: '✅ Zaliczył' }
  const statusColor = { locked: '#6b7280', in_progress: '#d97706', done: '#16a34a' }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(buildPath('/teacher'))}>← Wróć</button>
        <Logo height={26} />
      </header>

      <main style={s.main}>
        <h1 style={s.title}>Lista lekcji</h1>

        {loading && <p style={s.hint}>Ładowanie...</p>}

        {!loading && lessons.length === 0 && (
          <div style={s.empty} className="ui-card">
            <IllustrationState
              type="noLessons"
              title="Nie masz jeszcze lekcji"
              text="Nagraj pierwszą lekcję albo dodaj ją z widoku konkretnej klasy."
              action={(
            <button style={s.bigBtn} onClick={() => navigate(buildPath('/teacher/record'))}>
              🎙 Nagraj pierwszą lekcję
            </button>
              )}
            />
          </div>
        )}

        <div style={s.list}>
          {lessons.map(lesson => {
            const cls = classes[lesson.classId]
            const lessonNumber = lessons
              .slice()
              .sort((a, b) => lessonToUnix(a) - lessonToUnix(b))
              .findIndex((item) => item.id === lesson.id) + 1
            const displayTitle = formatDisplayTitle(lesson.title, lessonNumber)
            const lessonDate = resolveLessonDate(lesson)
            const pct = lesson.totalTasks > 0
              ? Math.round((lesson.doneTasks / lesson.totalTasks) * 100) : 0
            const isOpen = expanded === lesson.id

            return (
              <div key={lesson.id} style={s.card}>
                <div style={s.cardHeader} onClick={() => toggleExpand(lesson.id)}>
                  <div style={s.cardLeft}>
                    <button
                      style={s.lessonTitleBtn}
                      onClick={(e) => {
                        e.stopPropagation()
                        navigate(buildPath(`/teacher/lesson/${lesson.id}`))
                      }}
                    >
                      {displayTitle}
                    </button>
                    <p style={s.lessonMeta}>
                      {cls ? `${cls.name} · ${classSubjectLabel(cls, user?.uid)}` : lesson.classId} &nbsp;·&nbsp; {formatDate(lessonDate)}
                    </p>
                    {lesson.totalTasks > 0 && (
                      <div style={s.progressRow}>
                        <div style={s.progressBar}>
                          <div style={{ ...s.progressFill, width: `${pct}%` }} />
                        </div>
                        <span style={s.progressLabel}>
                          {lesson.doneTasks}/{lesson.totalTasks} zaliczonych
                        </span>
                      </div>
                    )}
                    {lesson.totalTasks === 0 && (
                      <p style={{ ...s.lessonMeta, color: '#9ca3af' }}>Brak uczniów / AI przetwarza</p>
                    )}
                  </div>
                  <span style={s.chevron}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={s.expandedBody}>
                    {!details[lesson.id] && <p style={s.hint}>Ładowanie uczniów...</p>}
                    {details[lesson.id]?.length === 0 && (
                      <p style={s.hint}>Brak przypisanych uczniów.</p>
                    )}
                    {details[lesson.id]?.map(row => (
                      <div key={row.taskId} style={s.studentRow}>
                        <span
                          style={{ ...s.studentName, cursor: 'pointer' }}
                          onClick={() => navigate(buildPath(`/teacher/student/${row.studentId}`))}
                        >
                          {row.name}
                        </span>
                        <span style={{ ...s.statusBadge, color: statusColor[row.status] }}>
                          {statusLabel[row.status] ?? row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
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
  main: { maxWidth: 760, margin: '0 auto', padding: '32px 24px' },
  title: { fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 24 },
  empty: { textAlign: 'center', padding: '48px 0', color: '#6b7280', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 },
  hint: { color: '#9ca3af', fontSize: 14 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, overflow: 'hidden' },
  cardHeader: { padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  cardLeft: { flex: 1 },
  lessonTitle: { fontSize: 16, fontWeight: 600, color: '#111827', margin: '0 0 4px' },
  lessonTitleBtn: { background: 'none', border: 'none', padding: 0, margin: '0 0 4px', color: '#111827', fontSize: 16, fontWeight: 700, textAlign: 'left', cursor: 'pointer' },
  lessonMeta: { fontSize: 13, color: '#6b7280', margin: '0 0 8px' },
  progressRow: { display: 'flex', alignItems: 'center', gap: 10 },
  progressBar: { flex: 1, maxWidth: 200, height: 6, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', background: '#2563eb', borderRadius: 4, transition: 'width .4s' },
  progressLabel: { fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' },
  chevron: { color: '#9ca3af', fontSize: 12, flexShrink: 0 },
  expandedBody: { borderTop: '1px solid #f3f4f6', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 8 },
  studentRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f9fafb' },
  studentName: { fontSize: 14, color: '#1d4ed8', fontWeight: 500, textDecoration: 'underline' },
  statusBadge: { fontSize: 13, fontWeight: 600 },
  bigBtn: { padding: '12px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
}
