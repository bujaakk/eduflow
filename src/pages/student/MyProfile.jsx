import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useEnvironment } from '../../contexts/EnvironmentContext'
import completedLessonsImg from '../../assets/metric-completed-lessons.png'
import studentActivityImg from '../../assets/metric-student-activity.png'
import learningGapsImg from '../../assets/metric-learning-gaps.png'

export default function StudentMyProfile() {
  const { user } = useAuth()
  const { buildPath } = useEnvironment()
  const navigate = useNavigate()

  const [student, setStudent] = useState(null)
  const [className, setClassName] = useState('')
  const [teachers, setTeachers] = useState([])
  const [profile, setProfile] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchData = async () => {
      const [studentSnap, profileSnap] = await Promise.all([
        getDoc(doc(db, 'students', user.uid)),
        getDoc(doc(db, 'student_profiles', user.uid)),
      ])

      if (!studentSnap.exists()) { setLoading(false); return }
      const studentData = studentSnap.data()
      setStudent(studentData)
      if (profileSnap.exists()) setProfile(profileSnap.data())

      // Klasa + nauczyciele
      if (studentData.classId) {
        const classSnap = await getDoc(doc(db, 'classes', studentData.classId))
        if (classSnap.exists()) {
          const cd = classSnap.data()
          const subjectLabel = Array.isArray(cd.subjects) && cd.subjects.length > 0
            ? cd.subjects.map((subject) => subject?.name).filter(Boolean).join(', ')
            : (cd.subject || 'brak przedmiotów')
          setClassName(`${cd.name} — ${subjectLabel}`)

          const teacherIds = [
            cd.teacherId,
            cd.homeroomTeacherId,
            ...(Array.isArray(cd.subjects) ? cd.subjects.map((subject) => subject?.teacherId) : []),
          ]
            .map((value) => String(value || '').trim())
            .filter(Boolean)

          if (teacherIds.length > 0) {
            const uniqueTeacherIds = [...new Set(teacherIds)]
            const teacherDocs = await Promise.all(uniqueTeacherIds.map((teacherId) => getDoc(doc(db, 'teachers', teacherId))))
            const subjectByTeacherId = new Map(
              (Array.isArray(cd.subjects) ? cd.subjects : [])
                .filter((subject) => subject?.teacherId)
                .map((subject) => [subject.teacherId, subject?.name || 'Przedmiot'])
            )

            const teacherRows = teacherDocs
              .filter((teacherSnap) => teacherSnap.exists())
              .map((teacherSnap) => {
                const td = teacherSnap.data()
                return {
                  name: `${td.firstName ?? ''} ${td.lastName ?? ''}`.trim() || td.email || teacherSnap.id,
                  subject: subjectByTeacherId.get(teacherSnap.id) || td.subject || 'Wychowawca',
                }
              })
            setTeachers(teacherRows)
          } else {
            setTeachers([])
          }
        }
      }

      // Tasks
      const tasksSnap = await getDocs(
        query(collection(db, 'tasks'), where('studentId', '==', user.uid))
      )
      const taskList = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTasks(taskList)
      setLoading(false)
    }
    fetchData()
  }, [user])

  const handleLogout = async () => {
    await signOut(auth)
    navigate(buildPath('/login'))
  }

  if (loading) return <div style={s.loading}>Ładowanie...</div>

  const done = tasks.filter(t => t.status === 'done').length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const locked = tasks.filter(t => t.status === 'locked').length
  const total = tasks.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const weaknesses = profile?.weaknesses ?? []

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate(buildPath('/student'))}>← Wróć</button>
        <Logo height={26} />
        <button style={s.logoutBtn} onClick={handleLogout}>Wyloguj</button>
      </header>

      <main style={s.main}>
        {/* Karta profilu */}
        <div style={s.profileCard}>
          <div style={s.avatar}>
            {(student?.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
          </div>
          <div>
            <h1 style={s.name}>
              {student ? `${student.firstName} ${student.lastName}` : user.email}
            </h1>
            <p style={s.meta}>{user.email}</p>
            {className && <p style={s.meta}>📚 {className}</p>}
          </div>
        </div>

        {/* Nauczyciele */}
        {teachers.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Moi nauczyciele</h2>
            {teachers.map((t, i) => (
              <div key={i} style={s.teacherRow}>
                <div style={s.teacherAvatar}>{t.name[0]}</div>
                <div>
                  <p style={s.teacherName}>{t.name}</p>
                  <p style={s.teacherSub}>{t.subject}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Postępy */}
        <div style={s.section}>
          <h2 style={s.sectionTitle}>Moje postępy</h2>
          <div style={s.statsRow}>
            <div style={{ ...s.statBox, borderColor: '#bbf7d0' }}>
              <img src={completedLessonsImg} alt="" style={s.statArt} loading="lazy" />
              <span style={{ ...s.statNum, color: '#16a34a' }}>{done}</span>
              <span style={s.statLabel}>✅ Zaliczone</span>
            </div>
            <div style={{ ...s.statBox, borderColor: '#fde68a' }}>
              <img src={studentActivityImg} alt="" style={s.statArt} loading="lazy" />
              <span style={{ ...s.statNum, color: '#d97706' }}>{inProgress}</span>
              <span style={s.statLabel}>⏳ W trakcie</span>
            </div>
            <div style={{ ...s.statBox, borderColor: '#e5e7eb' }}>
              <img src={learningGapsImg} alt="" style={s.statArt} loading="lazy" />
              <span style={{ ...s.statNum, color: '#6b7280' }}>{locked}</span>
              <span style={s.statLabel}>🔒 Nierozpoczęte</span>
            </div>
          </div>

          {/* Pasek postępu */}
          {total > 0 && (
            <div style={s.progressSection}>
              <div style={s.progressLabelRow}>
                <span style={s.progressText}>Ogólny postęp</span>
                <span style={s.progressPct}>{pct}%</span>
              </div>
              <div style={s.bigBar}>
                <div style={{ ...s.bigBarFill, width: `${pct}%` }} />
              </div>

              {/* Mini wykres słupkowy lekcji */}
              <div style={s.barsRow}>
                {tasks.map((t, i) => (
                  <div
                    key={t.id}
                    title={`Lekcja ${i + 1}: ${t.status}`}
                    style={{
                      ...s.miniBar,
                      background: t.status === 'done' ? '#22c55e'
                        : t.status === 'in_progress' ? '#f59e0b'
                        : '#d1d5db',
                    }}
                  />
                ))}
              </div>
              <p style={s.barHint}>Każdy słupek = jedna lekcja</p>
            </div>
          )}
        </div>

        {/* Słabe strony */}
        {weaknesses.length > 0 && (
          <div style={s.section}>
            <h2 style={s.sectionTitle}>Słabe strony — co warto powtórzyć</h2>
            <div style={s.tags}>
              {weaknesses.map((w, i) => (
                <span key={i} style={s.tag}>{w}</span>
              ))}
            </div>
          </div>
        )}

        {weaknesses.length === 0 && profile && (
          <div style={s.section}>
            <p style={s.hint}>🎉 Świetna robota! Brak zidentyfikowanych słabych stron.</p>
          </div>
        )}
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
  logoutBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  main: { maxWidth: 640, margin: '0 auto', padding: '32px 24px' },
  profileCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '24px', display: 'flex', gap: 20, alignItems: 'center', marginBottom: 16 },
  avatar: { width: 60, height: 60, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700, flexShrink: 0 },
  name: { fontSize: 20, fontWeight: 700, color: '#111827', margin: '0 0 4px' },
  meta: { fontSize: 14, color: '#6b7280', margin: '2px 0' },
  section: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '20px 24px', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#111827', marginBottom: 14 },
  teacherRow: { display: 'flex', alignItems: 'center', gap: 12 },
  teacherAvatar: { width: 38, height: 38, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, border: '1px solid #bfdbfe' },
  teacherName: { fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 2px' },
  teacherSub: { fontSize: 13, color: '#6b7280', margin: 0 },
  statsRow: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 },
  statBox: { background: '#f9fafb', borderRadius: 10, padding: '14px', textAlign: 'center', border: '1px solid' },
  statArt: { width: 42, height: 42, objectFit: 'contain', margin: '0 auto 6px', display: 'block' },
  statNum: { display: 'block', fontSize: 24, fontWeight: 700 },
  statLabel: { display: 'block', fontSize: 12, color: '#6b7280', marginTop: 4 },
  progressSection: { },
  progressLabelRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 6 },
  progressText: { fontSize: 13, color: '#6b7280' },
  progressPct: { fontSize: 13, fontWeight: 700, color: '#2563eb' },
  bigBar: { height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden', marginBottom: 14 },
  bigBarFill: { height: '100%', background: '#2563eb', borderRadius: 5, transition: 'width .4s' },
  barsRow: { display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 },
  miniBar: { width: 18, height: 32, borderRadius: 4 },
  barHint: { fontSize: 11, color: '#9ca3af' },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  tag: { background: '#fef3c7', color: '#92400e', fontSize: 13, fontWeight: 600, padding: '4px 12px', borderRadius: 20 },
  hint: { color: '#6b7280', fontSize: 14, margin: 0 },
}
