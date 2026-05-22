import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  doc, getDoc, collection, query, where, getDocs
} from 'firebase/firestore'
import { db } from '../../firebase'

export default function StudentProfile() {
  const { studentId } = useParams()
  const navigate = useNavigate()

  const [student, setStudent] = useState(null)
  const [profile, setProfile] = useState(null)
  const [className, setClassName] = useState('')
  const [tasks, setTasks] = useState([])
  const [lessonMap, setLessonMap] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const [studentSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, 'students', studentId)),
        getDoc(doc(db, 'student_profiles', studentId)),
      ])

      if (!studentSnap.exists()) { setLoading(false); return }
      const studentData = { id: studentSnap.id, ...studentSnap.data() }
      setStudent(studentData)
      if (profileSnap.exists()) setProfile(profileSnap.data())

      // Klasa
      if (studentData.classId) {
        const classSnap = await getDoc(doc(db, 'classes', studentData.classId))
        if (classSnap.exists()) {
          const cd = classSnap.data()
          setClassName(`${cd.name} — ${cd.subject}`)
        }
      }

      // Tasks
      const tasksSnap = await getDocs(
        query(collection(db, 'tasks'), where('studentId', '==', studentId))
      )
      const taskList = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }))

      // Pobierz tytuły lekcji
      const lessonIds = [...new Set(taskList.map(t => t.lessonId).filter(Boolean))]
      const lm = {}
      await Promise.all(lessonIds.map(async lid => {
        const ls = await getDoc(doc(db, 'lessons', lid))
        if (ls.exists()) lm[lid] = ls.data()
      }))
      setLessonMap(lm)
      setTasks(taskList)
      setLoading(false)
    }
    fetch()
  }, [studentId])

  if (loading) return <div style={s.loading}>Ładowanie...</div>
  if (!student) return <div style={s.loading}>Nie znaleziono ucznia.</div>

  const done = tasks.filter(t => t.status === 'done').length
  const total = tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const statusLabel = { locked: '🔒 Nie zaczął', in_progress: '⏳ W trakcie', done: '✅ Zaliczył' }
  const statusColor = { locked: '#6b7280', in_progress: '#d97706', done: '#16a34a' }

  const weaknesses = profile?.weaknesses ?? []
  const aiRec = profile?.aiRecommendation ?? ''

  const formatDate = (ts) => {
    if (!ts) return '—'
    return new Date(ts.seconds * 1000).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(-1)}>← Wróć</button>
        <Logo height={26} />
      </header>

      <main style={s.main}>
        {/* Karta profilu */}
        <div style={s.profileCard}>
          <div style={s.avatar}>
            {(student.firstName?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h1 style={s.name}>
              {student.firstName} {student.lastName}
            </h1>
            <p style={s.meta}>{student.email}</p>
            {className && <p style={s.meta}>📚 {className}</p>}
          </div>
        </div>

        {/* Postępy */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Postępy ogólne</h2>
          <div style={s.statsRow}>
            <div style={s.statBox}>
              <span style={s.statNum}>{done}</span>
              <span style={s.statLabel}>Zaliczone lekcje</span>
            </div>
            <div style={s.statBox}>
              <span style={s.statNum}>{total - done}</span>
              <span style={s.statLabel}>Do zaliczenia</span>
            </div>
            <div style={s.statBox}>
              <span style={s.statNum}>{pct}%</span>
              <span style={s.statLabel}>Skuteczność</span>
            </div>
          </div>
          <div style={s.bigBar}>
            <div style={{ ...s.bigBarFill, width: `${pct}%` }} />
          </div>
        </div>

        {/* Słabe strony */}
        {weaknesses.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Słabe strony</h2>
            <div style={s.tags}>
              {weaknesses.map((w, i) => (
                <span key={i} style={s.tag}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {/* Rekomendacja AI */}
        {aiRec && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Rekomendacja AI</h2>
            <div style={s.aiBox}>
              <span style={s.aiIcon}>🤖</span>
              <p style={s.aiText}>{aiRec}</p>
            </div>
          </div>
        )}

        {/* Historia zadań */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Historia lekcji</h2>
          {tasks.length === 0 && <p style={s.hint}>Brak przypisanych lekcji.</p>}
          {tasks.length > 0 && (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Lekcja</th>
                    <th style={s.th}>Data</th>
                    <th style={s.th}>Odpowiedzi</th>
                    <th style={s.th}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(task => {
                    const lesson = lessonMap[task.lessonId]
                    const totalQuestions = task.questions?.length ?? 0
                    const answeredCount = Math.max(0, Math.min(totalQuestions, Number(task.answeredCount ?? 0)))
                    return (
                      <tr key={task.id} style={s.tr}>
                        <td style={s.td}>{lesson?.title ?? task.lessonId}</td>
                        <td style={s.td}>{formatDate(lesson?.timestamp)}</td>
                        <td style={s.td}>
                          {answeredCount}/{totalQuestions || '?'}
                        </td>
                        <td style={{ ...s.td, fontWeight: 600, color: statusColor[task.status] }}>
                          {statusLabel[task.status] ?? task.status}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const s = {
  loading: { padding: 40, textAlign: 'center', color: '#6b7280', fontFamily: 'sans-serif' },
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  logo: { fontSize: 20, fontWeight: 700, color: '#2563eb' },
  main: { maxWidth: 760, margin: '0 auto', padding: '32px 24px' },
  profileCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px', display: 'flex', gap: 20, alignItems: 'center', marginBottom: 24 },
  avatar: { width: 60, height: 60, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, flexShrink: 0 },
  name: { fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' },
  meta: { fontSize: 14, color: '#6b7280', margin: '2px 0' },
  section: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 14 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 14 },
  statBox: { background: '#f9fafb', borderRadius: 10, padding: '14px', textAlign: 'center' },
  statNum: { display: 'block', fontSize: 24, fontWeight: 700, color: '#2563eb' },
  statLabel: { display: 'block', fontSize: 12, color: '#6b7280', marginTop: 4 },
  bigBar: { height: 8, background: '#e5e7eb', borderRadius: 4, overflow: 'hidden' },
  bigBarFill: { height: '100%', background: '#2563eb', borderRadius: 4, transition: 'width .4s' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tag: { background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20 },
  aiBox: { display: 'flex', gap: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 16px' },
  aiIcon: { fontSize: 20, flexShrink: 0, marginTop: 2 },
  aiText: { fontSize: 14, color: '#1e40af', lineHeight: 1.6, margin: 0 },
  hint: { color: '#9ca3af', fontSize: 14 },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6b7280', padding: '8px 12px', borderBottom: '1px solid #e5e7eb', textTransform: 'uppercase', letterSpacing: '0.05em' },
  tr: { borderBottom: '1px solid #f3f4f6' },
  td: { fontSize: 14, color: '#374151', padding: '10px 12px' },
}
