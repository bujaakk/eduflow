import { useEffect, useState } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { useNavigate } from 'react-router-dom'
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { BookOpen, LogOut, Mic, School, Users } from 'lucide-react'
import { db, auth, firebaseConfig } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useEnvironment } from '../../contexts/EnvironmentContext'
import Logo from '../../components/Logo'
import IllustrationState from '../../components/IllustrationState'
import completedLessonsImg from '../../assets/metric-completed-lessons.png'
import studentActivityImg from '../../assets/metric-student-activity.png'
import aiRecommendationsImg from '../../assets/metric-ai-recommendations.png'

const INVITE_WEBHOOK_URL = import.meta.env.VITE_INVITE_WEBHOOK_URL || '/api/invite'
const secondaryApp = getApps().find(app => app.name === 'teacher-admin') || initializeApp(firebaseConfig, 'teacher-admin')
const secondaryAuth = getAuth(secondaryApp)

function sendInviteEmail(payload) {
  fetch(INVITE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})
}

export default function TeacherDashboard() {
  const { user, teacherProfile } = useAuth()
  const { environmentId, isDefaultEnvironment, buildPath } = useEnvironment()
  const [classes, setClasses] = useState([])
  const [students, setStudents] = useState([])
  const [stats, setStats] = useState({ lessons: 0, students: 0 })
  const [loading, setLoading] = useState(true)
  const [showStudentModal, setShowStudentModal] = useState(false)
  const [studentForm, setStudentForm] = useState({ firstName: '', lastName: '', email: '', classId: '' })
  const [studentError, setStudentError] = useState('')
  const [studentLoading, setStudentLoading] = useState(false)
  const [deleteStudentId, setDeleteStudentId] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [envTeachers, setEnvTeachers] = useState([])
  const [envClasses, setEnvClasses] = useState([])
  const [adminTeacherForm, setAdminTeacherForm] = useState({ firstName: '', lastName: '', email: '', password: '', subjectsText: '' })
  const [adminClassForm, setAdminClassForm] = useState({ name: '', homeroomTeacherId: '' })
  const [adminMsg, setAdminMsg] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [hasAdminAccess, setHasAdminAccess] = useState(false)
  const [panelMode, setPanelMode] = useState('teacher')
  const navigate = useNavigate()

  const studentsLabel = (count) => `${count} ${count === 1 ? 'uczeń' : 'uczniów'}`
  const belongsToEnvironment = (row) => (row?.environmentId || 'default') === (isDefaultEnvironment ? 'default' : environmentId)
  const isEnvironmentAdmin = hasAdminAccess
  const classBelongsToTeacher = (cls) => {
    if (isEnvironmentAdmin) return true
    if (cls.teacherId === user?.uid || cls.homeroomTeacherId === user?.uid) return true
    return Array.isArray(cls.subjects) && cls.subjects.some((subject) => subject.teacherId === user?.uid)
  }

  useEffect(() => {
    const resolveAdminAccess = async () => {
      if (!user?.uid) {
        setHasAdminAccess(false)
        return
      }

      if (teacherProfile?.role === 'environment_admin') {
        setHasAdminAccess(true)
        return
      }

      if (!environmentId || environmentId === 'default') {
        setHasAdminAccess(false)
        return
      }

      try {
        const envSnap = await getDoc(doc(db, 'environments', environmentId))
        if (!envSnap.exists()) {
          setHasAdminAccess(false)
          return
        }
        const envData = envSnap.data()
        const adminIds = Array.isArray(envData?.adminIds)
          ? envData.adminIds
          : (envData?.adminId ? [envData.adminId] : [])
        setHasAdminAccess(adminIds.includes(user.uid))
      } catch {
        setHasAdminAccess(false)
      }
    }

    resolveAdminAccess()
  }, [user?.uid, teacherProfile?.role, environmentId])

  useEffect(() => {
    if (!isEnvironmentAdmin && panelMode !== 'teacher') {
      setPanelMode('teacher')
    }
  }, [isEnvironmentAdmin, panelMode])

  const reconcileClassesWithActiveStudents = async (classRows) => classRows.map((cls) => ({
    ...cls,
    studentIds: Array.isArray(cls.studentIds) ? cls.studentIds : [],
  }))

  useEffect(() => {
    if (!user) return
    const fetchData = async () => {
      const studentQuery = getDocs(collection(db, 'students'))
      const classesSnap = await getDocs(collection(db, 'classes'))
      const classesData = classesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((cls) => belongsToEnvironment(cls) && classBelongsToTeacher(cls))

      const lessonsSnap = await getDocs(
        query(collection(db, 'lessons'), where('teacherId', '==', user.uid))
      )

      const studentMap = {}
      const activeStudentsSnap = await studentQuery
      const activeStudentDocs = activeStudentsSnap.docs.filter((d) => belongsToEnvironment(d.data()))
      activeStudentDocs.forEach((d) => {
        studentMap[d.id] = { id: d.id, kind: 'active', ...d.data() }
      })

      const normalizedClasses = await reconcileClassesWithActiveStudents(classesData)

      const pendingInvitesSnap = await getDocs(query(collection(db, 'invitations'), where('teacherId', '==', user.uid)))
      pendingInvitesSnap.docs.forEach((d) => {
        const data = d.data()
        if (!belongsToEnvironment(data)) return
        if (data.status === 'used') return
        studentMap[`invite:${d.id}`] = { id: `invite:${d.id}`, inviteId: d.id, kind: 'pending', ...data }
      })

      await Promise.all(normalizedClasses.flatMap((cls) => ([
        getDocs(query(collection(db, 'students'), where('classId', '==', cls.id))),
        getDocs(query(collection(db, 'students'), where('classIds', 'array-contains', cls.id))),
      ])).map(async (snapshotPromise) => {
        const snapshot = await snapshotPromise
        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data()
          if (!belongsToEnvironment(data)) return
          studentMap[docSnap.id] = { id: docSnap.id, kind: 'active', ...data }
        })
      }))

      await Promise.all(normalizedClasses.flatMap((cls) => (cls.studentIds ?? []).map(async (studentId) => {
        if (studentMap[studentId]) return
        const studentSnap = await getDoc(doc(db, 'students', studentId))
        if (studentSnap.exists() && belongsToEnvironment(studentSnap.data())) studentMap[studentId] = { id: studentSnap.id, kind: 'active', ...studentSnap.data() }
      })))

      const lessonsCount = lessonsSnap.docs.filter((d) => belongsToEnvironment(d.data())).length

      const roster = Object.values(studentMap).sort((a, b) => {
        const aName = `${a.firstName ?? ''} ${a.lastName ?? ''} ${a.email ?? ''}`.trim()
        const bName = `${b.firstName ?? ''} ${b.lastName ?? ''} ${b.email ?? ''}`.trim()
        return aName.localeCompare(bName, 'pl')
      })
      setClasses(normalizedClasses)
      setStudents(roster)
      setStats({ lessons: lessonsCount, students: roster.length })
      setLoading(false)
    }
    fetchData()
  }, [user, environmentId, isDefaultEnvironment, isEnvironmentAdmin])

  useEffect(() => {
    if (!user || !isEnvironmentAdmin) return
    const fetchAdminData = async () => {
      const [teacherSnap, classSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'classes')),
      ])
      setEnvTeachers(teacherSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToEnvironment))
      setEnvClasses(classSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToEnvironment))
    }
    fetchAdminData()
  }, [user, isEnvironmentAdmin, environmentId, isDefaultEnvironment])

  const refreshAdminData = async () => {
    if (!isEnvironmentAdmin) return
    const [teacherSnap, classSnap] = await Promise.all([
      getDocs(collection(db, 'teachers')),
      getDocs(collection(db, 'classes')),
    ])
    setEnvTeachers(teacherSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToEnvironment))
    setEnvClasses(classSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(belongsToEnvironment))
  }

  const displayUserName = (person) => `${person?.firstName ?? ''} ${person?.lastName ?? ''}`.trim() || person?.email || 'Użytkownik'
  const teacherSubjectNames = (teacher) => Array.isArray(teacher?.subjects) && teacher.subjects.length > 0
    ? teacher.subjects.join(', ')
    : (teacher?.subject || 'brak przedmiotów')

  const handleCreateEnvironmentTeacher = async (event) => {
    event.preventDefault()
    setAdminMsg('')
    setAdminLoading(true)
    try {
      const firstName = adminTeacherForm.firstName.trim()
      const lastName = adminTeacherForm.lastName.trim()
      const email = adminTeacherForm.email.trim().toLowerCase()
      const password = adminTeacherForm.password
      const subjects = adminTeacherForm.subjectsText.split(',').map(item => item.trim()).filter(Boolean)
      if (!firstName || !lastName || !email || !password) throw new Error('Uzupełnij dane nauczyciela i hasło.')
      let uid = ''
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
        uid = cred.user.uid
        await secondaryAuth.signOut()
      } catch (err) {
        if (err?.code !== 'auth/email-already-in-use') throw err
        const existingSnap = await getDocs(query(collection(db, 'users'), where('email', '==', email)))
        if (existingSnap.empty) throw err
        uid = existingSnap.docs[0].id
      }
      const payload = { firstName, lastName, email, role: 'teacher', environmentId, subject: subjects[0] || '', subjects, updatedAt: serverTimestamp() }
      await Promise.all([
        setDoc(doc(db, 'teachers', uid), { ...payload, createdAt: serverTimestamp() }, { merge: true }),
        setDoc(doc(db, 'users', uid), payload, { merge: true }),
      ])
      setAdminTeacherForm({ firstName: '', lastName: '', email: '', password: '', subjectsText: '' })
      setAdminMsg(`✅ Dodano nauczyciela ${firstName} ${lastName}.`)
      await refreshAdminData()
    } catch (err) {
      setAdminMsg(`❌ ${err?.message || 'Nie udało się dodać nauczyciela.'}`)
    } finally {
      setAdminLoading(false)
    }
  }

  const handleCreateEnvironmentClass = async (event) => {
    event.preventDefault()
    setAdminMsg('')
    setAdminLoading(true)
    try {
      const name = adminClassForm.name.trim()
      const homeroomTeacherId = adminClassForm.homeroomTeacherId
      const homeroomTeacher = envTeachers.find(teacher => teacher.id === homeroomTeacherId)
      if (!name) throw new Error('Podaj nazwę klasy.')
      await addDoc(collection(db, 'classes'), {
        name,
        homeroomTeacherId,
        homeroomTeacherName: homeroomTeacher ? displayUserName(homeroomTeacher) : '',
        subjects: [],
        teacherId: '',
        subject: '',
        environmentId,
        studentIds: [],
        createdAt: serverTimestamp(),
      })
      setAdminClassForm({ name: '', homeroomTeacherId: '' })
      setAdminMsg(`✅ Dodano klasę ${name}.`)
      await refreshAdminData()
      await refreshAfterRosterChange()
    } catch (err) {
      setAdminMsg(`❌ ${err?.message || 'Nie udało się dodać klasy.'}`)
    } finally {
      setAdminLoading(false)
    }
  }

  const refreshAfterRosterChange = async () => {
    if (!user) return
    const studentQuery = getDocs(collection(db, 'students'))
    const [classesSnap, invitesSnap, activeSnap] = await Promise.all([
      getDocs(collection(db, 'classes')),
      getDocs(query(collection(db, 'invitations'), where('teacherId', '==', user.uid))),
      studentQuery,
    ])
    const classRows = classesSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter((cls) => belongsToEnvironment(cls) && classBelongsToTeacher(cls))
    const activeDocs = activeSnap.docs.filter((d) => belongsToEnvironment(d.data()))
    const normalizedClasses = await reconcileClassesWithActiveStudents(classRows)
    setClasses(normalizedClasses)
    const studentMap = {}
    activeDocs.forEach((d) => { studentMap[d.id] = { id: d.id, kind: 'active', ...d.data() } })
    invitesSnap.docs.forEach((d) => {
      const data = d.data()
      if (!belongsToEnvironment(data)) return
      if (data.status === 'used') return
      studentMap[`invite:${d.id}`] = { id: `invite:${d.id}`, inviteId: d.id, kind: 'pending', ...data }
    })

    await Promise.all(normalizedClasses.flatMap((cls) => ([
      getDocs(query(collection(db, 'students'), where('classId', '==', cls.id))),
      getDocs(query(collection(db, 'students'), where('classIds', 'array-contains', cls.id))),
    ])).map(async (snapshotPromise) => {
      const snapshot = await snapshotPromise
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data()
        if (!belongsToEnvironment(data)) return
        studentMap[docSnap.id] = { id: docSnap.id, kind: 'active', ...data }
      })
    }))

    await Promise.all(normalizedClasses.flatMap((cls) => (cls.studentIds ?? []).map(async (studentId) => {
      if (studentMap[studentId]) return
      const studentSnap = await getDoc(doc(db, 'students', studentId))
      if (studentSnap.exists() && belongsToEnvironment(studentSnap.data())) {
        studentMap[studentId] = { id: studentSnap.id, kind: 'active', ...studentSnap.data() }
      }
    })))

    const roster = Object.values(studentMap).sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), 'pl'))
    setStudents(roster)
    setStats(prev => ({ ...prev, students: roster.length }))
  }

  const createInviteCode = () => String(Math.floor(100000 + Math.random() * 900000))

  const handleCreateStudent = async () => {
    const firstName = studentForm.firstName.trim()
    const lastName = studentForm.lastName.trim()
    const email = studentForm.email.trim().toLowerCase()
    const classId = studentForm.classId
    if (!firstName || !lastName || !email) {
      setStudentError('Podaj imię, nazwisko i email ucznia.')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStudentError('Podaj poprawny email ucznia.')
      return
    }

    setStudentLoading(true)
    setStudentError('')
    try {
      const existingInvites = await getDocs(query(collection(db, 'invitations'), where('email', '==', email)))
      const hasTeacherInvite = existingInvites.docs.some((d) => d.data()?.teacherId === user.uid && d.data()?.status !== 'used' && belongsToEnvironment(d.data()))
      if (hasTeacherInvite) {
        setStudentError('Ten uczeń jest już na Twojej liście oczekujących.')
        setStudentLoading(false)
        return
      }

      const selectedClass = classes.find((cls) => cls.id === classId)
      const code = createInviteCode()
      const inviteRef = await addDoc(collection(db, 'invitations'), {
        email,
        firstName,
        lastName,
        teacherId: user.uid,
        classId,
        environmentId,
        code,
        status: 'pending',
        emailStatus: 'queued',
        sendAttempts: 0,
        createdAt: serverTimestamp(),
      })

      sendInviteEmail({
        studentEmail: email,
        email,
        firstName,
        lastName,
        classId,
        className: selectedClass?.name || '',
        teacherId: user.uid,
        environmentId,
        teacherName: auth.currentUser?.displayName || `${teacherProfile?.firstName || ''} ${teacherProfile?.lastName || ''}`.trim() || 'Nauczyciel',
        invitationId: inviteRef.id,
        code,
      })

      setShowStudentModal(false)
      setStudentForm({ firstName: '', lastName: '', email: '', classId: '' })
      await refreshAfterRosterChange()
    } catch {
      setStudentError('Nie udało się dodać ucznia do listy.')
    } finally {
      setStudentLoading(false)
    }
  }

  const handleAssignStudent = async (student, nextClassId) => {
    const previousClassIds = Array.isArray(student.classIds)
      ? student.classIds
      : (student.classId ? [student.classId] : [])

    try {
      if (student.kind === 'pending') {
        await updateDoc(doc(db, 'invitations', student.inviteId), { classId: nextClassId || '', environmentId })
      } else {
        if (!nextClassId) {
          await updateDoc(doc(db, 'students', student.id), {
            classId: '',
            classIds: [],
            teacherId: user.uid,
            environmentId,
          })
        } else {
          await updateDoc(doc(db, 'students', student.id), {
            classId: nextClassId,
            classIds: arrayUnion(nextClassId),
            teacherId: user.uid,
            environmentId,
          })
          await updateDoc(doc(db, 'classes', nextClassId), { studentIds: arrayUnion(student.id) })
        }
      }

      await Promise.all(previousClassIds
        .filter((id) => id && id !== nextClassId)
        .map((id) => updateDoc(doc(db, 'classes', id), { studentIds: arrayRemove(student.id) })))
      await refreshAfterRosterChange()
    } catch {
      setStudentError('Nie udało się przypisać ucznia do klasy.')
    }
  }

  const handleDeleteOfficialStudent = async (student) => {
    setStudentError('')
    try {
      if (student.kind === 'pending') {
        await deleteDoc(doc(db, 'invitations', student.inviteId))
      } else {
        const assignedClassIds = Array.isArray(student.classIds)
          ? student.classIds
          : (student.classId ? [student.classId] : [])
        await Promise.all(assignedClassIds.map((id) => updateDoc(doc(db, 'classes', id), { studentIds: arrayRemove(student.id) })))

        const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('studentId', '==', student.id)))
        for (const taskDoc of tasksSnap.docs) {
          const answersSnap = await getDocs(query(collection(db, 'answers'), where('taskId', '==', taskDoc.id)))
          await Promise.all(answersSnap.docs.map((answerDoc) => deleteDoc(doc(db, 'answers', answerDoc.id))))
          await deleteDoc(doc(db, 'tasks', taskDoc.id))
        }

        const invitesByStudentSnap = await getDocs(query(collection(db, 'invitations'), where('studentId', '==', student.id)))
        await Promise.all(invitesByStudentSnap.docs
          .filter((inviteDoc) => inviteDoc.data()?.teacherId === user.uid && belongsToEnvironment(inviteDoc.data()))
          .map((inviteDoc) => deleteDoc(doc(db, 'invitations', inviteDoc.id))))

        if (student.email) {
          const invitesByEmailSnap = await getDocs(query(collection(db, 'invitations'), where('email', '==', String(student.email).toLowerCase())))
          await Promise.all(invitesByEmailSnap.docs
            .filter((inviteDoc) => inviteDoc.data()?.teacherId === user.uid && belongsToEnvironment(inviteDoc.data()))
            .map((inviteDoc) => deleteDoc(doc(db, 'invitations', inviteDoc.id))))
        }

        await Promise.all([
          deleteDoc(doc(db, 'students', student.id)),
          deleteDoc(doc(db, 'student_profiles', student.id)).catch(() => {}),
        ])
      }
      setDeleteStudentId('')
      await refreshAfterRosterChange()
    } catch {
      setStudentError('Nie udało się usunąć ucznia z oficjalnej listy.')
    }
  }

  const handleLogout = async () => {
    await signOut(auth)
    navigate(buildPath('/login'))
  }

  const firstName = teacherProfile?.firstName ?? ''
  const normalizedStudentQuery = studentQuery.trim().toLowerCase()
  const filteredStudents = students.filter((student) => {
    if (!normalizedStudentQuery) return true
    const fullName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.toLowerCase()
    const email = String(student.email || '').toLowerCase()
    return fullName.includes(normalizedStudentQuery) || email.includes(normalizedStudentQuery)
  })
  const classSubjectLabelFull = (cls) => Array.isArray(cls?.subjects) && cls.subjects.length > 0
    ? cls.subjects.map((subject) => subject.name).filter(Boolean).join(', ')
    : (cls?.subject || (cls?.homeroomTeacherId === user?.uid ? 'Wychowawca' : 'brak przedmiotów'))

  const classSubjectLabelForViewer = (cls) => {
    if (isEnvironmentAdmin) return classSubjectLabelFull(cls)

    const subjects = Array.isArray(cls?.subjects) ? cls.subjects : []
    if (subjects.length > 0) {
      const teacherSubjects = subjects
        .filter((subject) => subject?.teacherId === user?.uid)
        .map((subject) => String(subject?.name || '').trim())
        .filter(Boolean)

      if (teacherSubjects.length > 0) return teacherSubjects.join(', ')
      if (cls?.homeroomTeacherId === user?.uid) return classSubjectLabelFull(cls)
      return 'brak przedmiotów'
    }

    if (cls?.teacherId === user?.uid) return cls?.subject || 'brak przedmiotów'
    if (cls?.homeroomTeacherId === user?.uid) return cls?.subject || 'Wychowawca'
    return 'brak przedmiotów'
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Logo height={26} />
        <button className="btn btn-ghost" onClick={handleLogout}>
          <LogOut size={16} />
          Wyloguj
        </button>
      </header>

      <main className="app-main">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Panel nauczyciela</p>
            <h1 className="page-title">Cześć, {firstName || 'nauczycielu'}</h1>
            <p className="page-subtitle">
              {teacherProfile?.subject ? `${teacherProfile.subject} · ` : ''}
              Zarządzaj klasami, nagrywaj lekcje i sprawdzaj, gdzie uczniowie potrzebują wsparcia.
            </p>
          </div>
          <div className="hero-actions">
            {isEnvironmentAdmin && (
              <>
                <button className={`btn ${panelMode === 'teacher' ? 'btn-primary' : 'btn-light'}`} onClick={() => setPanelMode('teacher')}>
                  Tryb nauczyciela
                </button>
                <button className={`btn ${panelMode === 'admin' ? 'btn-primary' : 'btn-light'}`} onClick={() => setPanelMode('admin')}>
                  Tryb admina
                </button>
              </>
            )}
            <button className="btn btn-light" onClick={() => navigate(buildPath('/teacher/lessons'))}>
              <BookOpen size={17} />
              Lista lekcji
            </button>
            <button className="btn btn-light" onClick={() => navigate(buildPath('/teacher/record'))}>
              <Mic size={17} />
              Nagraj lekcję
            </button>
            <button className="btn btn-light" onClick={() => setShowStudentModal(true)}>
              <Users size={17} />
              Dodaj ucznia
            </button>
          </div>
        </section>

        {isEnvironmentAdmin && panelMode === 'admin' && (
          <section className="ui-card" style={s.adminPanel}>
            <div style={s.adminHeader}>
              <div>
                <p className="eyebrow">Admin środowiska</p>
                <h2 className="section-title" style={{ margin: 0 }}>Zarządzanie szkołą</h2>
                <p style={s.adminHint}>Dodawaj nauczycieli i klasy tylko w tym środowisku.</p>
              </div>
              <span style={s.adminBadge}>{envTeachers.length} nauczycieli · {envClasses.length} klas</span>
            </div>

            {adminMsg && <p style={{ ...s.adminMsg, color: adminMsg.startsWith('✅') ? '#166534' : '#b91c1c' }}>{adminMsg}</p>}

            <div style={s.adminGrid}>
              <form onSubmit={handleCreateEnvironmentTeacher} style={s.adminBox}>
                <h3 style={s.adminBoxTitle}>Nowy nauczyciel</h3>
                <input style={s.input} placeholder="Imię" value={adminTeacherForm.firstName} onChange={(event) => setAdminTeacherForm(prev => ({ ...prev, firstName: event.target.value }))} />
                <input style={s.input} placeholder="Nazwisko" value={adminTeacherForm.lastName} onChange={(event) => setAdminTeacherForm(prev => ({ ...prev, lastName: event.target.value }))} />
                <input style={s.input} placeholder="Email" value={adminTeacherForm.email} onChange={(event) => setAdminTeacherForm(prev => ({ ...prev, email: event.target.value }))} />
                <input style={s.input} type="password" placeholder="Hasło startowe" value={adminTeacherForm.password} onChange={(event) => setAdminTeacherForm(prev => ({ ...prev, password: event.target.value }))} />
                <input style={s.input} placeholder="Przedmioty po przecinku" value={adminTeacherForm.subjectsText} onChange={(event) => setAdminTeacherForm(prev => ({ ...prev, subjectsText: event.target.value }))} />
                <button className="btn btn-primary" disabled={adminLoading}>{adminLoading ? 'Zapisywanie...' : 'Dodaj nauczyciela'}</button>
              </form>

              <form onSubmit={handleCreateEnvironmentClass} style={s.adminBox}>
                <h3 style={s.adminBoxTitle}>Nowa klasa</h3>
                <input style={s.input} placeholder="Nazwa klasy, np. 2A" value={adminClassForm.name} onChange={(event) => setAdminClassForm(prev => ({ ...prev, name: event.target.value }))} />
                <select style={s.input} value={adminClassForm.homeroomTeacherId} onChange={(event) => setAdminClassForm(prev => ({ ...prev, homeroomTeacherId: event.target.value }))}>
                  <option value="">Wychowawca opcjonalnie</option>
                  {envTeachers.map(teacher => <option key={teacher.id} value={teacher.id}>{displayUserName(teacher)} — {teacherSubjectNames(teacher)}</option>)}
                </select>
                <button className="btn btn-primary" disabled={adminLoading}>{adminLoading ? 'Zapisywanie...' : 'Dodaj klasę'}</button>
              </form>
            </div>

            <div style={s.adminListPanel}>
              <div style={s.adminListHeader}>
                <h3 style={s.adminBoxTitle}>Istniejące klasy</h3>
                <span style={s.adminListCount}>{envClasses.length}</span>
              </div>
              <div style={s.adminTeacherList}>
                {envClasses.length === 0 && <p style={s.emptyAdminList}>Brak klas w tym środowisku.</p>}
                {envClasses.map((cls) => {
                  const homeroom = envTeachers.find((teacher) => teacher.id === cls.homeroomTeacherId)
                  return (
                    <div key={cls.id} style={s.adminTeacherRow}>
                      <div style={s.teacherAvatar}>{String(cls.name || '?').slice(0, 1).toUpperCase()}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={s.teacherName}>{cls.name || 'Klasa bez nazwy'}</p>
                        <p style={s.teacherMeta}>Wychowawca: {homeroom ? displayUserName(homeroom) : cls.homeroomTeacherName || 'nie przypisano'}</p>
                        <p style={s.teacherMeta}>Przedmioty: {classSubjectLabelFull(cls)}</p>
                        <p style={s.teacherMeta}>Uczniowie: {(cls.studentIds || []).length}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={s.adminListPanel}>
              <div style={s.adminListHeader}>
                <h3 style={s.adminBoxTitle}>Istniejący nauczyciele</h3>
                <span style={s.adminListCount}>{envTeachers.length}</span>
              </div>
              <div style={s.adminTeacherList}>
                {envTeachers.length === 0 && <p style={s.emptyAdminList}>Brak nauczycieli w tym środowisku.</p>}
                {envTeachers.map((teacher) => {
                  const teacherClasses = envClasses.filter((cls) => cls.homeroomTeacherId === teacher.id || cls.teacherId === teacher.id || (cls.subjects || []).some((subject) => subject.teacherId === teacher.id))
                  return (
                    <div key={teacher.id} style={s.adminTeacherRow}>
                      <div style={s.teacherAvatar}>{displayUserName(teacher)[0]?.toUpperCase() || '?'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={s.teacherName}>{displayUserName(teacher)}</p>
                        <p style={s.teacherMeta}>{teacher.email || 'brak emaila'}</p>
                        <p style={s.teacherMeta}>Przedmioty: {teacherSubjectNames(teacher)}</p>
                        <p style={s.teacherMeta}>Klasy: {teacherClasses.length ? teacherClasses.map((cls) => cls.name).join(', ') : 'brak przypisanych klas'}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {panelMode === 'teacher' && (
          <>

        <div className="stats-grid">
          <div className="ui-card stat-card">
            <img src={completedLessonsImg} alt="" style={s.statArt} loading="lazy" />
            <span className="stat-value">{stats.lessons}</span>
            <span className="stat-label">Przeprowadzone lekcje</span>
          </div>
          <div className="ui-card stat-card">
            <img src={studentActivityImg} alt="" style={s.statArt} loading="lazy" />
            <span className="stat-value">{stats.students}</span>
            <span className="stat-label">Aktywni uczniowie</span>
          </div>
          <div className="ui-card stat-card">
            <img src={aiRecommendationsImg} alt="" style={s.statArt} loading="lazy" />
            <span className="stat-value">{isEnvironmentAdmin ? envClasses.length : classes.length}</span>
            <span className="stat-label">Klasy</span>
          </div>
        </div>

        <div className="section-bar">
          <h2 className="section-title">Moje klasy</h2>
        </div>

        {loading ? (
          <div className="ui-card loading-panel" aria-label="Ładowanie klas">
            <div className="loading-title" />
            <div className="loading-row">
              <div className="loading-line w-85" />
              <div className="loading-line w-40" />
            </div>
          </div>
        ) : classes.length === 0 ? (
          <div className="ui-card">
            <IllustrationState
              type="inviteStudents"
              title="Nie masz jeszcze klas"
              text="Dodaj klasy w panelu admina, a pojawią się tutaj jako szybkie kafelki pracy."
            />
          </div>
        ) : (
          <div className="cards-grid">
            {classes.map(cls => (
              <div
                key={cls.id}
                className="ui-card action-card"
                onClick={() => navigate(buildPath(`/teacher/class/${cls.id}`))}
              >
                <span className="badge badge-progress"><School size={14} /> Klasa</span>
                <div className="card-title" style={{ marginTop: 14 }}>{cls.name}</div>
                <div className="card-meta">{classSubjectLabelForViewer(cls)}</div>
                <div className="card-meta" style={{ color: 'var(--color-primary)', fontWeight: 800 }}>
                  <Users size={14} style={{ verticalAlign: -2, marginRight: 5 }} />
                  {studentsLabel(cls.studentIds?.length ?? 0)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="section-bar">
          <h2 className="section-title">Uczniowie</h2>
          <button className="btn btn-primary" onClick={() => setShowStudentModal(true)}>+ Dodaj ucznia</button>
        </div>

        <div className="ui-card" style={s.searchWrap}>
          <input
            style={s.searchInput}
            value={studentQuery}
            onChange={(event) => setStudentQuery(event.target.value)}
            placeholder="Szukaj ucznia po imieniu, nazwisku lub emailu"
          />
        </div>

        {studentError && <div className="ui-card" style={s.errorBox}>{studentError}</div>}

        {loading ? (
          <div className="ui-card loading-panel" aria-label="Ładowanie uczniów">
            <div className="loading-title" />
            <div className="loading-row">
              <div className="loading-line w-85" />
              <div className="loading-line w-70" />
              <div className="loading-line w-55" />
            </div>
          </div>
        ) : students.length === 0 ? (
          <div className="ui-card">
            <IllustrationState
              type="inviteStudents"
              title="Brak uczniów na liście"
              text="Dodaj ucznia raz, a potem przypisuj go do wybranej klasy bez tworzenia profilu od nowa."
              action={<button className="btn btn-primary" onClick={() => setShowStudentModal(true)}>Dodaj ucznia</button>}
            />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="ui-card">
            <IllustrationState
              type="noStudents"
              title="Brak wyników wyszukiwania"
              text="Nie znaleziono ucznia spełniającego podany filtr."
            />
          </div>
        ) : (
          <div className="stack-list">
            {filteredStudents.map((student) => {
              const fullName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim() || student.email || 'Uczeń'
              const currentClassId = student.classId || student.classIds?.[0] || ''
              const currentClass = classes.find((cls) => cls.id === currentClassId)
              return (
                <div key={student.id} className="ui-card" style={s.studentRow}>
                  <div style={s.studentAvatar}>{(fullName[0] || '?').toUpperCase()}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <button
                      style={s.studentNameBtn}
                      onClick={() => student.kind === 'active' && navigate(buildPath(`/teacher/student/${student.id}`))}
                      disabled={student.kind !== 'active'}
                    >
                      {fullName}
                    </button>
                    <div style={s.studentMeta}>{student.email} · {student.kind === 'pending' ? 'czeka na aktywację konta' : 'konto aktywne'}{currentClass ? ` · ${currentClass.name}` : ''}</div>
                    {student.kind === 'pending' && student.code && (
                      <div style={s.activationRow}>
                        <span style={s.pendingPill}>Kod aktywacyjny</span>
                        <span style={s.codeInline}>{student.code}</span>
                      </div>
                    )}
                  </div>
                  <select
                    style={s.assignSelect}
                    value={currentClassId}
                    onChange={(event) => handleAssignStudent(student, event.target.value)}
                  >
                    <option value="">Bez klasy</option>
                    {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name} — {classSubjectLabelForViewer(cls)}</option>)}
                  </select>
                  {deleteStudentId === student.id ? (
                    <span style={s.confirmInline}>
                      Usunąć z listy?{' '}
                      <button style={s.dangerBtn} onClick={() => handleDeleteOfficialStudent(student)}>Tak</button>
                      <button style={s.cancelBtn} onClick={() => setDeleteStudentId('')}>Nie</button>
                    </span>
                  ) : (
                    <button style={s.deleteBtn} onClick={() => setDeleteStudentId(student.id)}>Usuń</button>
                  )}
                </div>
              )
            })}
          </div>
        )}
          </>
        )}
      </main>

      {showStudentModal && (
        <div style={s.overlay} onClick={() => setShowStudentModal(false)}>
          <div style={s.modal} onClick={(event) => event.stopPropagation()}>
            <h2 style={s.modalTitle}>Dodaj ucznia do listy</h2>
            <p style={s.modalHint}>Uczeń dostanie kod pierwszego logowania. Klasę możesz wybrać teraz albo później.</p>
            <input style={s.input} placeholder="Imię" value={studentForm.firstName} onChange={(event) => setStudentForm(prev => ({ ...prev, firstName: event.target.value }))} />
            <input style={s.input} placeholder="Nazwisko" value={studentForm.lastName} onChange={(event) => setStudentForm(prev => ({ ...prev, lastName: event.target.value }))} />
            <input style={s.input} placeholder="Email ucznia" value={studentForm.email} onChange={(event) => setStudentForm(prev => ({ ...prev, email: event.target.value }))} />
            <select style={s.input} value={studentForm.classId} onChange={(event) => setStudentForm(prev => ({ ...prev, classId: event.target.value }))}>
              <option value="">Bez klasy na razie</option>
              {classes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name} — {classSubjectLabelForViewer(cls)}</option>)}
            </select>
            {studentError && <p style={s.modalError}>{studentError}</p>}
            <div style={s.modalBtns}>
              <button style={s.cancelModalBtn} onClick={() => setShowStudentModal(false)}>Anuluj</button>
              <button style={s.primaryBtn} onClick={handleCreateStudent} disabled={studentLoading}>{studentLoading ? 'Dodawanie...' : 'Dodaj i wygeneruj kod'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  logo: { fontSize: 20, fontWeight: 700, color: '#2563eb' },
  logoutBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, color: '#6b7280' },
  main: { maxWidth: 900, margin: '0 auto', padding: '32px 24px' },
  welcome: { fontSize: 28, fontWeight: 700, marginBottom: 24, color: '#111827' },
  statsRow: { display: 'flex', gap: 16, marginBottom: 40 },
  statCard: { flex: 1, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 16px', textAlign: 'center' },
  statNum: { display: 'block', fontSize: 32, fontWeight: 700, color: '#2563eb' },
  statLabel: { fontSize: 13, color: '#6b7280', marginTop: 4, display: 'block' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: 600, color: '#111827' },
  primaryBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  secondaryBtn: { background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 500, fontSize: 14 },
  classGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 },
  classCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px', cursor: 'pointer' },
  className: { fontSize: 17, fontWeight: 600, color: '#111827', marginBottom: 4 },
  classSubject: { fontSize: 13, color: '#6b7280', marginBottom: 12 },
  classCount: { fontSize: 13, color: '#2563eb', fontWeight: 500 },
  hint: { color: '#9ca3af', fontSize: 14 },
  statArt: { width: 54, height: 54, objectFit: 'contain', float: 'right', marginLeft: 10, marginBottom: 8 },
  adminPanel: { padding: 18, marginBottom: 20, border: '1px solid #bfdbfe', background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' },
  adminHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 },
  adminHint: { margin: '6px 0 0', color: '#64748b', fontSize: 13, lineHeight: 1.5 },
  adminBadge: { borderRadius: 999, padding: '6px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontSize: 12, fontWeight: 800 },
  adminMsg: { margin: '0 0 12px', fontSize: 13, fontWeight: 700 },
  adminGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 },
  adminBox: { border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff' },
  adminBoxTitle: { margin: '0 0 10px', color: '#0f172a', fontSize: 15, fontWeight: 900 },
  adminListPanel: { marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', padding: 14 },
  adminListHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  adminListCount: { minWidth: 28, height: 28, display: 'inline-grid', placeItems: 'center', borderRadius: 999, background: '#f1f5f9', color: '#0f172a', fontSize: 12, fontWeight: 900 },
  adminTeacherList: { display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto', paddingRight: 4 },
  adminTeacherRow: { display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid #edf2f7', borderRadius: 12, padding: 10, background: '#fbfdff' },
  teacherAvatar: { width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#dbeafe', color: '#1d4ed8', fontWeight: 900, flex: '0 0 auto' },
  teacherName: { margin: 0, color: '#0f172a', fontSize: 14, fontWeight: 900 },
  teacherMeta: { margin: '3px 0 0', color: '#64748b', fontSize: 12, lineHeight: 1.45, overflowWrap: 'anywhere' },
  emptyAdminList: { margin: 0, color: '#64748b', fontSize: 13 },
  searchWrap: { padding: 12, marginBottom: 12 },
  searchInput: { width: '100%', border: '1px solid #cbd5e1', borderRadius: 10, padding: '10px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#0f172a' },
  studentRow: { padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  studentAvatar: { width: 42, height: 42, borderRadius: 14, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, #2563eb, #14b8a6)', color: '#fff', fontWeight: 800, flexShrink: 0 },
  studentNameBtn: { background: 'none', border: 'none', padding: 0, color: '#0f172a', fontWeight: 800, fontSize: 15, cursor: 'pointer', textAlign: 'left' },
  studentMeta: { color: '#64748b', fontSize: 13, marginTop: 3, lineHeight: 1.45 },
  assignSelect: { minWidth: 190, padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 13, color: '#0f172a', background: '#fff' },
  activationRow: { marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: 999, padding: '4px 10px' },
  pendingPill: { fontSize: 11, color: '#0f766e', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' },
  codeInline: { fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#1d4ed8', letterSpacing: 3 },
  deleteBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  dangerBtn: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  cancelBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 700 },
  confirmInline: { fontSize: 13, color: '#334155', display: 'inline-flex', alignItems: 'center', gap: 5 },
  errorBox: { padding: 12, color: '#b91c1c', marginBottom: 12, fontSize: 13 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, .45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: 430, maxWidth: '100%', boxShadow: '0 24px 70px rgba(15, 23, 42, .24)' },
  modalTitle: { fontSize: 20, fontWeight: 800, margin: '0 0 8px', color: '#0f172a' },
  modalHint: { color: '#64748b', fontSize: 13, margin: '0 0 14px', lineHeight: 1.55 },
  input: { width: '100%', padding: '11px 13px', fontSize: 14, border: '1px solid #cbd5e1', borderRadius: 9, outline: 'none', boxSizing: 'border-box', marginBottom: 10 },
  modalError: { color: '#b91c1c', fontSize: 13, margin: '0 0 8px' },
  modalBtns: { display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end', flexWrap: 'wrap' },
  cancelModalBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, color: '#374151' },
}
