import { useState, useEffect } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import {
  collection, addDoc, getDocs, setDoc, doc, deleteDoc,
  updateDoc, arrayRemove, arrayUnion, deleteField, serverTimestamp, getDoc, onSnapshot, query, where
} from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'

const ADMIN_PASSWORD = 'hackaton'
import Logo from '../components/Logo'
const SESSION_KEY = 'eduflow_admin_auth'
const DEFAULT_ENVIRONMENT = { id: 'default', name: 'EduFlow Default', slug: 'default', type: 'default', status: 'active' }
const ENVIRONMENT_TYPES = [
  { value: 'school', label: 'Szkoła' },
  { value: 'tutoring', label: 'Korepetycje' },
  { value: 'course', label: 'Kurs' },
]
const USER_ROLES = [
  { value: 'environment_admin', label: 'Admin środowiska' },
  { value: 'teacher', label: 'Nauczyciel/prowadzący' },
  { value: 'student', label: 'Uczeń' },
]

const slugify = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/^-+|-+$/g, '')

const secondaryApp = getApps().find(a => a.name === 'admin') || initializeApp(firebaseConfig, 'admin')
const secondaryAuth = getAuth(secondaryApp)

export default function AdminPanel() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [tab, setTab] = useState('environments') // 'environments' | 'users' | 'analytics'
  const amplitudeDashboardUrl = import.meta.env.VITE_AMPLITUDE_DASHBOARD_URL || ''
  const amplitudeEmbedUrl = import.meta.env.VITE_AMPLITUDE_EMBED_URL || amplitudeDashboardUrl

  const [environments, setEnvironments] = useState([])
  const [appUsers, setAppUsers] = useState([])
  const [teachers, setTeachers] = useState([])
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])

  const [environmentForm, setEnvironmentForm] = useState({ name: '', slug: '', type: 'school' })
  const [userForm, setUserForm] = useState({ firstName: '', lastName: '', email: '', password: '', role: 'teacher', subject: '', environmentId: 'default' })
  const [teacherForm, setTeacherForm] = useState({ firstName: '', lastName: '', subject: '', email: '', password: '', role: 'teacher', environmentId: 'default' })
  const [classForm, setClassForm] = useState({ name: '', homeroomTeacherId: '', environmentId: 'default' })
  const [environmentClassForms, setEnvironmentClassForms] = useState({})
  const [subjectForms, setSubjectForms] = useState({})
  const [editingUser, setEditingUser] = useState(null)
  const [environmentMsg, setEnvironmentMsg] = useState('')
  const [userMsg, setUserMsg] = useState('')
  const [teacherMsg, setTeacherMsg] = useState('')
  const [classMsg, setClassMsg] = useState('')
  const [adminError, setAdminError] = useState('')
  const [loadingE, setLoadingE] = useState(false)
  const [loadingU, setLoadingU] = useState(false)
  const [loadingT, setLoadingT] = useState(false)
  const [loadingC, setLoadingC] = useState(false)

  // Edycja klasy
  const [editingClass, setEditingClass] = useState(null) // {id, name, subject, teacherId}
  const [editMsg, setEditMsg] = useState('')

  // Reset hasła nauczyciela
  const [resetStatuses, setResetStatuses] = useState({}) // teacherId → { loading, msg }

  // Rozwinięta klasa (lista uczniów)
  const [expandedEnvironment, setExpandedEnvironment] = useState('default')
  const [expandedClass, setExpandedClass] = useState(null)
  const [classStudents, setClassStudents] = useState({}) // classId → [{uid, firstName, lastName, email}]

  useEffect(() => {
    if (!authed) return

    const unsubTeachers = onSnapshot(
      collection(db, 'teachers'),
      (snap) => {
        setTeachers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setAdminError('')
      },
      () => setAdminError('❌ Nie udało się załadować nauczycieli. Sprawdź reguły Firestore lub połączenie.')
    )

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        setAppUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setAdminError('')
      },
      () => setAdminError('❌ Nie udało się załadować użytkowników. Sprawdź reguły Firestore lub połączenie.')
    )

    const unsubStudents = onSnapshot(
      collection(db, 'students'),
      (snap) => {
        setStudents(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setAdminError('')
      },
      () => setAdminError('❌ Nie udało się załadować uczniów. Sprawdź reguły Firestore lub połączenie.')
    )

    const unsubEnvironments = onSnapshot(
      collection(db, 'environments'),
      (snap) => {
        setEnvironments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setAdminError('')
      },
      () => setAdminError('❌ Nie udało się załadować środowisk. Sprawdź reguły Firestore lub połączenie.')
    )

    const unsubClasses = onSnapshot(
      collection(db, 'classes'),
      (snap) => {
        setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setAdminError('')
      },
      () => setAdminError('❌ Nie udało się załadować klas. Sprawdź reguły Firestore lub połączenie.')
    )

    return () => {
      unsubEnvironments()
      unsubUsers()
      unsubTeachers()
      unsubStudents()
      unsubClasses()
    }
  }, [authed])

  const fetchAll = async () => {
    try {
      const [uSnap, tSnap, sSnap, cSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'classes')),
      ])
      const eSnap = await getDocs(collection(db, 'environments'))
      setEnvironments(eSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setAppUsers(uSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTeachers(tSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setStudents(sSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setClasses(cSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setAdminError('')
    } catch {
      setAdminError('❌ Nie udało się odświeżyć danych admina.')
    }
  }

  const mapAuthError = (err, fallback = 'Wystąpił błąd. Spróbuj ponownie.') => {
    switch (err?.code) {
      case 'auth/email-already-in-use':
        return 'Ten email ma już konto.'
      case 'auth/invalid-email':
        return 'Nieprawidłowy email.'
      case 'auth/weak-password':
        return 'Hasło jest za słabe (min. 6 znaków).'
      case 'auth/network-request-failed':
        return 'Brak połączenia z siecią. Spróbuj ponownie.'
      case 'permission-denied':
        return 'Brak uprawnień do tej operacji.'
      default:
        return err?.message || fallback
    }
  }

  const handleLogin = () => {
    if (pw === ADMIN_PASSWORD) { sessionStorage.setItem(SESSION_KEY, '1'); setAuthed(true) }
    else setPwError('Nieprawidłowe hasło.')
  }
  const handleLogout = () => { sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }

  const environmentOptions = [DEFAULT_ENVIRONMENT, ...environments]
  const environmentOf = (id) => environmentOptions.find(env => env.id === (id || 'default')) || DEFAULT_ENVIRONMENT
  const userMap = new Map()
  appUsers.forEach((u) => userMap.set(u.id, { ...u, id: u.id, source: 'users' }))
  teachers.forEach((t) => userMap.set(t.id, { ...userMap.get(t.id), ...t, id: t.id, role: t.role || 'teacher', source: 'teachers' }))
  students.forEach((student) => {
    if (userMap.has(student.id)) {
      userMap.set(student.id, { ...userMap.get(student.id), ...student, id: student.id, role: userMap.get(student.id).role || 'student' })
    } else {
      userMap.set(student.id, { ...student, id: student.id, role: 'student', source: 'students' })
    }
  })
  const allUsers = Array.from(userMap.values()).sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''), 'pl'))
  const displayUserName = (user) => `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Użytkownik'
  const usersForEnvironment = (environmentId) => allUsers.filter((user) => (user.environmentId || 'default') === environmentId)
  const teachersForEnvironment = (environmentId) => teachers.filter((teacher) => (teacher.environmentId || 'default') === environmentId)
  const studentsForEnvironment = (environmentId) => students.filter((student) => (student.environmentId || 'default') === environmentId)
  const classesForEnvironment = (environmentId) => classes.filter((cls) => (cls.environmentId || 'default') === environmentId)
  const roleLabel = (role) => USER_ROLES.find((item) => item.value === role)?.label || role || 'użytkownik'
  const teacherSubjectNames = (teacher) => Array.isArray(teacher?.subjects) && teacher.subjects.length > 0
    ? teacher.subjects.join(', ')
    : (teacher?.subject || 'brak przedmiotów')
  const classSubjects = (cls) => Array.isArray(cls?.subjects) && cls.subjects.length > 0
    ? cls.subjects
    : (cls?.subject ? [{ id: 'legacy', name: cls.subject, teacherId: cls.teacherId || '' }] : [])
  const teacherTeachesClass = (teacherId, cls) => classSubjects(cls).some((subject) => subject.teacherId === teacherId)
  const teacherIsHomeroom = (teacherId, cls) => (cls.homeroomTeacherId || '') === teacherId

  const handleCreateEnvironment = async (e) => {
    e.preventDefault(); setEnvironmentMsg(''); setLoadingE(true)
    try {
      const name = environmentForm.name.trim()
      const slug = slugify(environmentForm.slug || environmentForm.name)
      if (!name || !slug) throw new Error('Podaj nazwę i slug środowiska.')
      const existing = await getDocs(query(collection(db, 'environments'), where('slug', '==', slug)))
      if (!existing.empty) throw new Error('Ten slug jest już zajęty.')

      await addDoc(collection(db, 'environments'), {
        name,
        slug,
        type: environmentForm.type,
        status: 'active',
        adminIds: [],
        createdAt: serverTimestamp(),
      })
      setEnvironmentMsg(`✅ Środowisko "${name}" dodane. Link: /e/${slug}/login`)
      setEnvironmentForm({ name: '', slug: '', type: 'school' })
    } catch (err) {
      setEnvironmentMsg(`❌ ${err?.message || 'Nie udało się dodać środowiska.'}`)
    } finally { setLoadingE(false) }
  }

  const upsertUserIndex = async (uid, payload) => {
    await setDoc(doc(db, 'users', uid), {
      ...payload,
      email: String(payload.email || '').trim().toLowerCase(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
  }

  const handleCreateUser = async (e) => {
    e.preventDefault(); setUserMsg(''); setLoadingU(true)
    try {
      const firstName = userForm.firstName.trim()
      const lastName = userForm.lastName.trim()
      const email = userForm.email.trim().toLowerCase()
      const password = userForm.password
      const role = userForm.role
      const environmentId = userForm.environmentId || 'default'
      const subject = userForm.subject.trim()
      const subjects = subject.split(',').map((item) => item.trim()).filter(Boolean)
      if (!firstName || !lastName || !email || !password) throw new Error('Uzupełnij imię, nazwisko, email i hasło.')
      if (role !== 'student' && !subject) throw new Error('Dla nauczyciela/admina podaj przedmiot lub obszar.')

      let uid = ''
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
        uid = cred.user.uid
        await secondaryAuth.signOut()
      } catch (err) {
        if (err?.code !== 'auth/email-already-in-use') throw err
        const existingUser = allUsers.find((user) => String(user.email || '').toLowerCase() === email)
        if (!existingUser?.id) throw err
        uid = existingUser.id
      }

      const sharedPayload = { firstName, lastName, email, role, environmentId }
      if (role === 'student') {
        await Promise.all([
          setDoc(doc(db, 'students', uid), {
            ...sharedPayload,
            teacherId: '',
            classId: '',
            classIds: [],
            joinedAt: serverTimestamp(),
            passwordSet: true,
          }, { merge: true }),
          setDoc(doc(db, 'student_profiles', uid), {
            environmentId,
            weaknesses: [],
            errorHistory: [],
            aiRecommendation: '',
            updatedAt: serverTimestamp(),
          }, { merge: true }),
          upsertUserIndex(uid, sharedPayload),
        ])
      } else {
        const teacherPayload = { ...sharedPayload, subject: subjects[0] || subject, subjects, role }
        await Promise.all([
          setDoc(doc(db, 'teachers', uid), { ...teacherPayload, updatedAt: serverTimestamp(), createdAt: serverTimestamp() }, { merge: true }),
          upsertUserIndex(uid, teacherPayload),
        ])
      }

      setUserMsg(`✅ Dodano użytkownika ${firstName} ${lastName}.`)
      setUserForm({ firstName: '', lastName: '', email: '', password: '', role: 'teacher', subject: '', environmentId })
    } catch (err) {
      setUserMsg(`❌ ${mapAuthError(err, 'Nie udało się dodać użytkownika.')}`)
    } finally { setLoadingU(false) }
  }

  const handleAssignEnvironmentAdmin = async (env, userId) => {
    if (!env?.id || env.id === 'default' || !userId) return
    const selectedUser = allUsers.find((user) => user.id === userId)
    if (!selectedUser) return
    const environmentId = env.id
    const adminPayload = {
      firstName: selectedUser.firstName || '',
      lastName: selectedUser.lastName || '',
      email: selectedUser.email || '',
      subject: selectedUser.subject || 'Administracja',
      role: 'environment_admin',
      environmentId,
      updatedAt: serverTimestamp(),
    }

    try {
      await Promise.all([
        updateDoc(doc(db, 'environments', env.id), {
          adminId: selectedUser.id,
          adminName: displayUserName(selectedUser),
          adminEmail: selectedUser.email || '',
          updatedAt: serverTimestamp(),
        }),
        setDoc(doc(db, 'teachers', selectedUser.id), adminPayload, { merge: true }),
        upsertUserIndex(selectedUser.id, adminPayload),
      ])
      setEnvironmentMsg(`✅ ${displayUserName(selectedUser)} jest adminem środowiska ${env.name}.`)
    } catch (err) {
      setEnvironmentMsg(`❌ ${mapAuthError(err, 'Nie udało się przypisać admina środowiska.')}`)
    }
  }

  const updateClassFormForEnvironment = (environmentId, patch) => {
    setEnvironmentClassForms((prev) => ({
      ...prev,
      [environmentId]: { name: '', homeroomTeacherId: '', ...(prev[environmentId] || {}), ...patch },
    }))
  }

  const updateSubjectForm = (classId, patch) => {
    setSubjectForms((prev) => ({
      ...prev,
      [classId]: { name: '', teacherId: '', ...(prev[classId] || {}), ...patch },
    }))
  }

  const handleCreateEnvironmentClass = async (env, e) => {
    e.preventDefault(); setClassMsg(''); setLoadingC(true)
    try {
      const environmentId = env.id || 'default'
      const form = environmentClassForms[environmentId] || { name: '', homeroomTeacherId: '' }
      const name = String(form.name || '').trim()
      const homeroomTeacherId = form.homeroomTeacherId || ''
      const teacher = teachers.find(t => t.id === homeroomTeacherId)
      if (!name) throw new Error('Podaj nazwę klasy.')
      await addDoc(collection(db, 'classes'), {
        name,
        homeroomTeacherId,
        homeroomTeacherName: teacher ? displayUserName(teacher) : '',
        subjects: [],
        subject: '',
        teacherId: '',
        environmentId,
        studentIds: [],
        createdAt: serverTimestamp(),
      })
      setClassMsg(`✅ Klasa "${name}" dodana do ${env.name}.`)
      updateClassFormForEnvironment(environmentId, { name: '', homeroomTeacherId: '' })
      setExpandedEnvironment(environmentId)
    } catch (err) { setClassMsg(`❌ ${mapAuthError(err, 'Nie udało się dodać klasy.')}`) }
    finally { setLoadingC(false) }
  }

  const handleAddClassSubject = async (cls) => {
    const form = subjectForms[cls.id] || { name: '', teacherId: '' }
    const name = String(form.name || '').trim()
    const teacherId = form.teacherId
    const teacher = teachers.find(t => t.id === teacherId)
    if (!name) { setClassMsg('❌ Podaj nazwę przedmiotu.'); return }
    if (!teacherId) { setClassMsg('❌ Wybierz nauczyciela przedmiotu.'); return }
    const nextSubject = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, name, teacherId, teacherName: teacher ? displayUserName(teacher) : '' }
    const currentSubjects = classSubjects(cls).filter((subject) => subject.id !== 'legacy')
    const nextSubjects = [...currentSubjects, nextSubject]
    try {
      await updateDoc(doc(db, 'classes', cls.id), {
        subjects: nextSubjects,
        subject: nextSubjects[0]?.name || '',
        teacherId: nextSubjects[0]?.teacherId || '',
        updatedAt: serverTimestamp(),
      })
      updateSubjectForm(cls.id, { name: '', teacherId: '' })
      setClassMsg(`✅ Dodano przedmiot ${name} do klasy ${cls.name}.`)
    } catch (err) {
      setClassMsg(`❌ ${mapAuthError(err, 'Nie udało się dodać przedmiotu.')}`)
    }
  }

  const handleRemoveClassSubject = async (cls, subjectId) => {
    const nextSubjects = classSubjects(cls).filter((subject) => subject.id !== subjectId && subject.id !== 'legacy')
    try {
      await updateDoc(doc(db, 'classes', cls.id), {
        subjects: nextSubjects,
        subject: nextSubjects[0]?.name || '',
        teacherId: nextSubjects[0]?.teacherId || '',
        updatedAt: serverTimestamp(),
      })
      setClassMsg('✅ Usunięto przedmiot z klasy.')
    } catch (err) {
      setClassMsg(`❌ ${mapAuthError(err, 'Nie udało się usunąć przedmiotu.')}`)
    }
  }

  const handleEditUser = (user) => {
    setEditingUser({
      id: user.id,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      email: user.email || '',
      role: user.role || 'student',
      environmentId: user.environmentId || 'default',
      subject: user.subject || '',
      subjectsText: Array.isArray(user.subjects) ? user.subjects.join(', ') : (user.subject || ''),
    })
    setUserMsg('')
  }

  const handleSaveUserProfile = async () => {
    if (!editingUser?.id) return
    const role = editingUser.role || 'student'
    const environmentId = editingUser.environmentId || 'default'
    const subjects = editingUser.subjectsText.split(',').map((item) => item.trim()).filter(Boolean)
    const payload = {
      firstName: editingUser.firstName.trim(),
      lastName: editingUser.lastName.trim(),
      email: editingUser.email.trim().toLowerCase(),
      role,
      environmentId,
      subject: subjects[0] || editingUser.subject.trim(),
      subjects,
      updatedAt: serverTimestamp(),
    }
    try {
      const writes = [upsertUserIndex(editingUser.id, payload)]
      if (role === 'student') {
        writes.push(setDoc(doc(db, 'students', editingUser.id), payload, { merge: true }))
        writes.push(deleteDoc(doc(db, 'teachers', editingUser.id)).catch(() => {}))
        writes.push(setDoc(doc(db, 'student_profiles', editingUser.id), { environmentId, updatedAt: serverTimestamp() }, { merge: true }))
      } else {
        writes.push(setDoc(doc(db, 'teachers', editingUser.id), payload, { merge: true }))
        writes.push(deleteDoc(doc(db, 'students', editingUser.id)).catch(() => {}))
      }
      await Promise.all(writes)
      setUserMsg(`✅ Zapisano profil ${payload.firstName} ${payload.lastName}.`)
      setEditingUser(null)
    } catch (err) {
      setUserMsg(`❌ ${mapAuthError(err, 'Nie udało się zapisać profilu.')}`)
    }
  }

  const handleResetUserPassword = async (user) => {
    if (!user?.email) return
    setResetStatuses(prev => ({ ...prev, [user.id]: { loading: true, msg: '' } }))
    try {
      await sendPasswordResetEmail(auth, user.email)
      setResetStatuses(prev => ({ ...prev, [user.id]: { loading: false, msg: `✅ Link wysłany na: ${user.email}` } }))
    } catch (err) {
      setResetStatuses(prev => ({ ...prev, [user.id]: { loading: false, msg: `❌ ${mapAuthError(err, 'Nie udało się wysłać resetu.')}` } }))
    }
  }

  const handleAddEnvironmentAdmin = async (env, userId) => {
    if (!env?.id || env.id === 'default' || !userId) return
    const selectedUser = allUsers.find((user) => user.id === userId)
    if (!selectedUser) return
    const subject = selectedUser.subject || 'Administracja'
    const subjects = Array.isArray(selectedUser.subjects) && selectedUser.subjects.length ? selectedUser.subjects : [subject]
    try {
      await Promise.all([
        updateDoc(doc(db, 'environments', env.id), {
          adminIds: arrayUnion(userId),
          adminNames: arrayUnion(displayUserName(selectedUser)),
          updatedAt: serverTimestamp(),
        }),
        setDoc(doc(db, 'teachers', userId), {
          firstName: selectedUser.firstName || '',
          lastName: selectedUser.lastName || '',
          email: selectedUser.email || '',
          role: 'environment_admin',
          environmentId: env.id,
          subject,
          subjects,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        upsertUserIndex(userId, { ...selectedUser, role: 'environment_admin', environmentId: env.id, subject, subjects }),
      ])
      setEnvironmentMsg(`✅ Dodano admina ${displayUserName(selectedUser)} do ${env.name}.`)
    } catch (err) {
      setEnvironmentMsg(`❌ ${mapAuthError(err, 'Nie udało się dodać admina środowiska.')}`)
    }
  }

  const handleRemoveEnvironmentAdmin = async (env, user) => {
    if (!env?.id || !user?.id) return
    try {
      const nextEnvironmentPayload = {
        adminIds: arrayRemove(user.id),
        adminNames: arrayRemove(displayUserName(user)),
        updatedAt: serverTimestamp(),
      }
      if (env.adminId === user.id) {
        nextEnvironmentPayload.adminId = deleteField()
        nextEnvironmentPayload.adminName = deleteField()
        nextEnvironmentPayload.adminEmail = deleteField()
      }

      const remainingAdminEnvironment = environments.find((candidate) => {
        if (candidate.id === env.id) return false
        const candidateAdminIds = candidate.adminIds || (candidate.adminId ? [candidate.adminId] : [])
        return candidateAdminIds.includes(user.id)
      })
      const nextRole = remainingAdminEnvironment ? 'environment_admin' : 'teacher'
      const nextEnvironmentId = remainingAdminEnvironment?.id || 'default'
      const subject = user.subject || 'Administracja'
      const subjects = Array.isArray(user.subjects) && user.subjects.length ? user.subjects : [subject]

      await Promise.all([
        updateDoc(doc(db, 'environments', env.id), nextEnvironmentPayload),
        setDoc(doc(db, 'teachers', user.id), {
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          email: user.email || '',
          role: nextRole,
          environmentId: nextEnvironmentId,
          subject,
          subjects,
          updatedAt: serverTimestamp(),
        }, { merge: true }),
        upsertUserIndex(user.id, { ...user, role: nextRole, environmentId: nextEnvironmentId, subject, subjects }),
      ])
      setEnvironmentMsg(`✅ Usunięto admina ${displayUserName(user)} z ${env.name}.`)
    } catch (err) {
      setEnvironmentMsg(`❌ ${mapAuthError(err, 'Nie udało się usunąć admina.')}`)
    }
  }

  const handleMoveUserEnvironment = async (user, nextEnvironmentId) => {
    if (!user?.id || !nextEnvironmentId) return
    try {
      const payload = { environmentId: nextEnvironmentId, updatedAt: serverTimestamp() }
      const writes = [upsertUserIndex(user.id, { ...user, environmentId: nextEnvironmentId })]
      if (user.role === 'student') {
        writes.push(setDoc(doc(db, 'students', user.id), payload, { merge: true }))
        writes.push(setDoc(doc(db, 'student_profiles', user.id), { environmentId: nextEnvironmentId, updatedAt: serverTimestamp() }, { merge: true }))
      } else {
        writes.push(setDoc(doc(db, 'teachers', user.id), payload, { merge: true }))
      }
      await Promise.all(writes)
      setUserMsg(`✅ Przeniesiono ${displayUserName(user)} do ${environmentOf(nextEnvironmentId).name}.`)
    } catch (err) {
      setUserMsg(`❌ ${mapAuthError(err, 'Nie udało się zmienić środowiska użytkownika.')}`)
    }
  }

  const handleDeleteUser = async (user) => {
    if (!user?.id) return
    if (!confirm(`Usunąć ${displayUserName(user)} z panelu EduFlow?\n\nKonto Firebase Auth może pozostać, ale użytkownik zniknie z aplikacji, list i klas.`)) return
    try {
      const userClassIds = Array.isArray(user.classIds) ? user.classIds : (user.classId ? [user.classId] : [])
      await Promise.all(userClassIds.map((classId) => updateDoc(doc(db, 'classes', classId), { studentIds: arrayRemove(user.id) }).catch(() => {})))
      const teacherClasses = classes.filter((cls) => cls.teacherId === user.id)
      await Promise.all(teacherClasses.map((cls) => updateDoc(doc(db, 'classes', cls.id), { teacherId: '', subject: cls.subject || '' }).catch(() => {})))
      await Promise.all([
        deleteDoc(doc(db, 'users', user.id)).catch(() => {}),
        deleteDoc(doc(db, 'teachers', user.id)).catch(() => {}),
        deleteDoc(doc(db, 'students', user.id)).catch(() => {}),
        deleteDoc(doc(db, 'student_profiles', user.id)).catch(() => {}),
      ])
      setUserMsg(`✅ Usunięto ${displayUserName(user)} z aplikacji.`)
    } catch (err) {
      setUserMsg(`❌ ${mapAuthError(err, 'Nie udało się usunąć użytkownika.')}`)
    }
  }

  // --- Tworzenie nauczyciela ---
  const handleCreateTeacher = async (e) => {
    e.preventDefault(); setTeacherMsg(''); setLoadingT(true)
    try {
      const { firstName, lastName, subject, email, password, role, environmentId } = teacherForm
      let created = false
      let existingTeacherDoc = null
      const teacherPayload = {
        firstName,
        lastName,
        subject,
        email,
        role,
        environmentId: environmentId || 'default',
        updatedAt: serverTimestamp(),
      }

      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
        await setDoc(doc(db, 'teachers', cred.user.uid), { ...teacherPayload, createdAt: serverTimestamp() }, { merge: true })
        await upsertUserIndex(cred.user.uid, teacherPayload)
        await secondaryAuth.signOut()
        created = true
      } catch (err) {
        if (err?.code !== 'auth/email-already-in-use') throw err

        const existingTeacherSnap = await getDocs(query(collection(db, 'teachers'), where('email', '==', email)))
        if (!existingTeacherSnap.empty) {
          existingTeacherDoc = existingTeacherSnap.docs[0]
          await setDoc(doc(db, 'teachers', existingTeacherDoc.id), {
            ...teacherPayload,
          }, { merge: true })
          await upsertUserIndex(existingTeacherDoc.id, teacherPayload)
        } else {
          throw err
        }
      }

      if (created) {
        setTeacherMsg(`✅ Nauczyciel ${firstName} ${lastName} dodany.`)
      } else if (existingTeacherDoc) {
        setTeacherMsg(`✅ Konto już istniało. Zaktualizowano dane nauczyciela (${email}).`)
      }
      setTeacherForm({ firstName: '', lastName: '', subject: '', email: '', password: '', role: 'teacher', environmentId: environmentId || 'default' })
    } catch (err) {
      setTeacherMsg(`❌ ${mapAuthError(err, 'Nie udało się dodać nauczyciela.')}`)
    }
    finally { setLoadingT(false) }
  }

  // --- Reset hasła nauczyciela ---
  const handleResetPassword = async (teacher) => {
    setResetStatuses(prev => ({ ...prev, [teacher.id]: { loading: true, msg: '' } }))
    try {
      await sendPasswordResetEmail(auth, teacher.email)
      setResetStatuses(prev => ({ ...prev, [teacher.id]: { loading: false, msg: `✅ Link wysłany na: ${teacher.email}` } }))
    } catch (err) {
      setResetStatuses(prev => ({ ...prev, [teacher.id]: { loading: false, msg: `❌ ${mapAuthError(err, 'Nie udało się wysłać linku resetu.')}` } }))
    }
  }

  // --- Usunięcie nauczyciela (tylko doc Firestore — konto Auth zostaje) ---
  const handleDeleteTeacher = async (teacher) => {
    if (!confirm(`Usunąć nauczyciela ${teacher.firstName} ${teacher.lastName}?\n\nJego klasy NIE zostaną usunięte.`)) return
    await Promise.all([
      deleteDoc(doc(db, 'teachers', teacher.id)),
      deleteDoc(doc(db, 'users', teacher.id)).catch(() => {}),
      ...classes.filter((cls) => cls.teacherId === teacher.id).map((cls) => updateDoc(doc(db, 'classes', cls.id), { teacherId: '' }).catch(() => {})),
    ])
    setTeachers(prev => prev.filter(t => t.id !== teacher.id))
  }

  // --- Tworzenie klasy ---
  const handleCreateClass = async (e) => {
    e.preventDefault(); setClassMsg(''); setLoadingC(true)
    try {
      const { name, teacherId } = classForm
      const teacher = teachers.find(t => t.id === teacherId)
      if (!teacher?.subject) throw new Error('Najpierw przypisz przedmiot do nauczyciela.')
      const environmentId = classForm.environmentId || teacher.environmentId || 'default'
      await addDoc(collection(db, 'classes'), { name, subject: teacher.subject, teacherId, environmentId, studentIds: [], createdAt: serverTimestamp() })
      setClassMsg(`✅ Klasa "${name}" dodana.`)
      setClassForm({ name: '', teacherId: '', environmentId })
    } catch (err) { setClassMsg(`❌ ${mapAuthError(err, 'Nie udało się dodać klasy.')}`) }
    finally { setLoadingC(false) }
  }

  // --- Usunięcie klasy ---
  const handleDeleteClass = async (cls) => {
    if (!confirm(`Usunąć klasę "${cls.name}"?\n\nUczniowie NIE zostaną usunięci z Firebase Auth.`)) return
    await deleteDoc(doc(db, 'classes', cls.id))
    setClasses(prev => prev.filter(c => c.id !== cls.id))
  }

  // --- Edycja klasy ---
  const handleEditClass = (cls) => {
    setEditingClass({ ...cls })
    setEditMsg('')
  }
  const handleSaveEdit = async () => {
    if (!editingClass) return
    setEditMsg('')
    try {
      const homeroomTeacher = teachers.find(t => t.id === editingClass.homeroomTeacherId)
      await updateDoc(doc(db, 'classes', editingClass.id), {
        name: editingClass.name,
        homeroomTeacherId: editingClass.homeroomTeacherId || '',
        homeroomTeacherName: homeroomTeacher ? displayUserName(homeroomTeacher) : '',
        environmentId: editingClass.environmentId || 'default',
        updatedAt: serverTimestamp(),
      })
      setEditMsg('✅ Zapisano.')
      setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, ...editingClass, homeroomTeacherName: homeroomTeacher ? displayUserName(homeroomTeacher) : '' } : c))
    } catch (err) { setEditMsg(`❌ ${mapAuthError(err, 'Nie udało się zapisać zmian.')}`) }
  }

  // --- Rozwiń klasę i załaduj uczniów ---
  const toggleExpandClass = async (cls) => {
    if (expandedClass === cls.id) { setExpandedClass(null); return }
    setExpandedClass(cls.id)
    if (classStudents[cls.id]) return
    const students = await Promise.all(
      (cls.studentIds ?? []).map(async uid => {
        const snap = await getDoc(doc(db, 'students', uid))
        return snap.exists() ? { uid, ...snap.data() } : { uid, firstName: '?', lastName: '', email: uid }
      })
    )
    setClassStudents(prev => ({ ...prev, [cls.id]: students }))
  }

  // --- Usuń ucznia z klasy ---
  const handleRemoveStudent = async (classId, uid) => {
    if (!confirm('Usunąć ucznia z klasy?')) return
    await updateDoc(doc(db, 'classes', classId), { studentIds: arrayRemove(uid) })
    setClassStudents(prev => ({ ...prev, [classId]: prev[classId].filter(s => s.uid !== uid) }))
    setClasses(prev => prev.map(c => c.id === classId
      ? { ...c, studentIds: (c.studentIds ?? []).filter(id => id !== uid) }
      : c))
  }

  // ======= LOGIN =======
  if (!authed) {
    return (
      <div style={s.page}>
        <div style={s.loginBox}>
          <Logo height={42} style={{ marginBottom: 8 }} />
          <p style={s.adminLabel}>Panel administratora</p>
          <input
            type="password" placeholder="Hasło admina" value={pw}
            onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={s.input}
          />
          {pwError && <p style={s.error}>{pwError}</p>}
          <button style={s.btn} onClick={handleLogin}>Wejdź</button>
        </div>
      </div>
    )
  }

  const teacherOf = (id) => teachers.find(t => t.id === id)

  // ======= PANEL =======
  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.brandBlock}>
          <Logo height={28} />
          <div>
            <p style={s.headerKicker}>Konsola główna</p>
            <h1 style={s.headerTitle}>Zarządzanie EduFlow</h1>
          </div>
        </div>
        <div style={s.headerActions}>
          <button style={s.logoutBtn} onClick={handleLogout}>Wyloguj</button>
        </div>
      </header>

      <main style={s.main}>
        <section style={s.heroCard}>
          <div>
            <p style={s.heroKicker}>Panel administracyjny</p>
            <h2 style={s.heroTitle}>Środowiska, osoby i klasy w jednym widoku</h2>
            <p style={s.heroText}>Rozwiń szkołę lub kurs, żeby zobaczyć jej klasy, nauczycieli i uczniów bez szukania po osobnych zakładkach.</p>
          </div>
          <div style={s.statStrip}>
            <div style={s.statPill}><span style={s.statValue}>{environmentOptions.length}</span><span style={s.statLabel}>Środowiska</span></div>
            <div style={s.statPill}><span style={s.statValue}>{allUsers.length}</span><span style={s.statLabel}>Użytkownicy</span></div>
            <div style={s.statPill}><span style={s.statValue}>{classes.length}</span><span style={s.statLabel}>Klasy</span></div>
          </div>
        </section>

        {adminError && <p style={{ ...s.error, marginBottom: 12 }}>{adminError}</p>}

        {/* Zakładki */}
        <div style={s.tabs}>
          {['environments', 'users', 'analytics'].map(t => (
            <button key={t} style={{ ...s.tabBtn, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              <span style={s.tabIcon}>{t === 'environments' ? '🌐' : t === 'users' ? '👥' : '📈'}</span>
              {t === 'environments' ? 'Środowiska' : t === 'users' ? 'Użytkownicy' : 'Analityka'}
            </button>
          ))}
        </div>

        {/* ===== ŚRODOWISKA ===== */}
        {tab === 'environments' && (
          <>
            <div style={s.card}>
              <div style={s.cardHeaderBlock}>
                <div>
                  <p style={s.sectionEyebrow}>Tworzenie</p>
                  <h2 style={s.cardTitle}>Nowe środowisko</h2>
                </div>
                <span style={s.softBadge}>Szkoła · korepetycje · kurs</span>
              </div>
              <form onSubmit={handleCreateEnvironment} style={s.formRow}>
                <input placeholder="Nazwa, np. LO Kopernik" style={s.input} value={environmentForm.name}
                  onChange={e => setEnvironmentForm(p => ({ ...p, name: e.target.value, slug: p.slug || slugify(e.target.value) }))} required />
                <input placeholder="slug, np. lo-kopernik" style={s.input} value={environmentForm.slug}
                  onChange={e => setEnvironmentForm(p => ({ ...p, slug: slugify(e.target.value) }))} required />
                <select style={s.input} value={environmentForm.type}
                  onChange={e => setEnvironmentForm(p => ({ ...p, type: e.target.value }))}>
                  {ENVIRONMENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <button type="submit" style={s.btn} disabled={loadingE}>{loadingE ? '...' : 'Dodaj środowisko'}</button>
              </form>
              {environmentMsg && <p style={{ color: environmentMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 8 }}>{environmentMsg}</p>}
            </div>

            <div style={s.list}>
              {environmentOptions.map(env => {
                const environmentId = env.id || 'default'
                const envTeachers = teachersForEnvironment(environmentId)
                const envStudents = studentsForEnvironment(environmentId)
                const envClasses = classesForEnvironment(environmentId)
                const isOpen = expandedEnvironment === environmentId
                const form = environmentClassForms[environmentId] || { name: '', homeroomTeacherId: '' }

                return (
                  <div key={environmentId} style={s.environmentCard}>
                    <div style={s.environmentHeader}>
                      <div style={s.rowAvatar}>{env.type === 'school' ? 'S' : env.type === 'tutoring' ? 'K' : env.type === 'course' ? 'C' : 'E'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={s.environmentTitleRow}>
                            <p style={s.environmentName}>{env.name}</p>
                            <span style={s.statusBadge}>{env.status || 'active'}</span>
                          </div>
                          <p style={s.rowMeta}>{ENVIRONMENT_TYPES.find(type => type.value === env.type)?.label || 'Domyślne'} · slug: {env.slug}</p>
                          <div style={s.environmentMetrics}>
                            <span style={s.metricChip}>{envClasses.length} klas</span>
                            <span style={s.metricChip}>{envTeachers.length} nauczycieli</span>
                            <span style={s.metricChip}>{envStudents.length} uczniów</span>
                          </div>
                          <p style={s.rowMeta}>Link: /e/{env.slug}/login</p>
                          <p style={s.rowMeta}>Admin: {(env.adminIds?.length || env.adminId) ? 'przypisany poniżej' : 'nie przypisano'}</p>
                      </div>
                      {env.id !== 'default' && (
                        <div style={s.adminPicker}>
                          <select
                            style={{ ...s.input, flex: '1 1 220px' }}
                            value=""
                            onChange={(event) => handleAddEnvironmentAdmin(env, event.target.value)}
                          >
                            <option value="">Dodaj admina środowiska</option>
                            {allUsers.map((user) => (
                              <option key={user.id} value={user.id}>{displayUserName(user)} — {user.email}</option>
                            ))}
                          </select>
                          <div style={s.adminChips}>
                            {(env.adminIds || (env.adminId ? [env.adminId] : [])).map((adminId) => {
                              const admin = allUsers.find((user) => user.id === adminId) || { id: adminId, email: adminId }
                              return (
                                <span key={adminId} style={s.adminChip}>
                                  {displayUserName(admin)}
                                  <button style={s.chipRemoveBtn} type="button" onClick={() => handleRemoveEnvironmentAdmin(env, admin)}>×</button>
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      <button style={s.iconBtn} onClick={() => setExpandedEnvironment(isOpen ? '' : environmentId)}>
                        {isOpen ? '▲ Szczegóły' : '▼ Szczegóły'}
                      </button>
                    </div>

                    {isOpen && (
                      <div style={s.environmentBody}>
                        <div style={s.envGrid}>
                          <section style={s.envPanel}>
                            <div style={s.panelHeading}>
                              <h3 style={s.panelTitle}>Klasy i przedmioty</h3>
                              <span style={s.panelCount}>{envClasses.length}</span>
                            </div>
                            <form onSubmit={(event) => handleCreateEnvironmentClass(env, event)} style={s.formRow}>
                              <input placeholder="Nazwa klasy, np. 2A" style={s.input} value={form.name || ''}
                                onChange={event => updateClassFormForEnvironment(environmentId, { name: event.target.value })} required />
                              <select style={s.input} value={form.homeroomTeacherId || ''}
                                onChange={event => updateClassFormForEnvironment(environmentId, { homeroomTeacherId: event.target.value })}>
                                <option value="">Wychowawca klasy (opcjonalnie)</option>
                                {envTeachers.map(teacher => (
                                  <option key={teacher.id} value={teacher.id}>{displayUserName(teacher)} — {teacherSubjectNames(teacher)}</option>
                                ))}
                              </select>
                              <button style={s.btn} disabled={loadingC}>{loadingC ? '...' : 'Dodaj klasę'}</button>
                            </form>
                            {classMsg && <p style={{ color: classMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 8 }}>{classMsg}</p>}
                            <div style={s.compactList}>
                              {envClasses.length === 0 && <p style={s.hint}>Brak klas w tym środowisku.</p>}
                              {envClasses.map(cls => {
                                const homeroomTeacher = teacherOf(cls.homeroomTeacherId)
                                const subjects = classSubjects(cls)
                                const subjectForm = subjectForms[cls.id] || { name: '', teacherId: '' }
                                const isExpanded = expandedClass === cls.id
                                const isEditing = editingClass?.id === cls.id
                                return (
                                  <div key={cls.id} style={s.classCard}>
                                    <div style={s.classHeader}>
                                      <div style={{ flex: 1 }}>
                                        <p style={s.rowName}>{cls.name}</p>
                                        <p style={s.rowMeta}>Wychowawca: {homeroomTeacher ? displayUserName(homeroomTeacher) : 'nie przypisano'} · {cls.studentIds?.length ?? 0} uczniów</p>
                                        <div style={s.subjectChips}>
                                          {subjects.length === 0 && <span style={s.mutedChip}>brak przedmiotów</span>}
                                          {subjects.map((subject) => {
                                            const subjectTeacher = teacherOf(subject.teacherId)
                                            return <span key={subject.id || subject.name} style={s.subjectChip}>{subject.name} · {subjectTeacher ? displayUserName(subjectTeacher) : 'bez nauczyciela'}</span>
                                          })}
                                        </div>
                                      </div>
                                      <button style={s.iconBtn} onClick={() => { handleEditClass(cls); setExpandedClass(null) }}>Edytuj</button>
                                      <button style={s.iconBtn} onClick={() => { toggleExpandClass(cls); setEditingClass(null) }}>{isExpanded ? '▲ Uczniowie' : '▼ Uczniowie'}</button>
                                      <button style={s.deleteBtn} onClick={() => handleDeleteClass(cls)}>Usuń</button>
                                    </div>
                                    {isEditing && (
                                      <div style={s.editBox}>
                                        <div style={s.formRow}>
                                          <input style={s.input} value={editingClass.name}
                                            onChange={e => setEditingClass(p => ({ ...p, name: e.target.value }))} placeholder="Nazwa" />
                                          <select style={s.input} value={editingClass.homeroomTeacherId || ''}
                                            onChange={e => setEditingClass(p => ({ ...p, homeroomTeacherId: e.target.value }))}>
                                            <option value="">Bez wychowawcy</option>
                                            {envTeachers.map(t => (
                                              <option key={t.id} value={t.id}>{displayUserName(t)} — {teacherSubjectNames(t)}</option>
                                            ))}
                                          </select>
                                          <button type="button" style={s.btn} onClick={handleSaveEdit}>Zapisz</button>
                                          <button type="button" style={s.cancelBtn} onClick={() => setEditingClass(null)}>Anuluj</button>
                                        </div>
                                        {editMsg && <p style={{ color: editMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 6 }}>{editMsg}</p>}
                                        <div style={s.subjectEditor}>
                                          <input style={s.input} placeholder="Przedmiot, np. Matematyka" value={subjectForm.name || ''}
                                            onChange={(event) => updateSubjectForm(cls.id, { name: event.target.value })} />
                                          <select style={s.input} value={subjectForm.teacherId || ''}
                                            onChange={(event) => updateSubjectForm(cls.id, { teacherId: event.target.value })}>
                                            <option value="">Nauczyciel przedmiotu</option>
                                            {envTeachers.map(t => <option key={t.id} value={t.id}>{displayUserName(t)} — {teacherSubjectNames(t)}</option>)}
                                          </select>
                                          <button type="button" style={s.btn} onClick={() => handleAddClassSubject(cls)}>Dodaj przedmiot</button>
                                        </div>
                                        <div style={s.subjectList}>
                                          {subjects.map((subject) => (
                                            <span key={subject.id || subject.name} style={s.subjectChip}>
                                              {subject.name} · {teacherOf(subject.teacherId) ? displayUserName(teacherOf(subject.teacherId)) : 'bez nauczyciela'}
                                              {subject.id !== 'legacy' && <button style={s.chipRemoveBtn} type="button" onClick={() => handleRemoveClassSubject(cls, subject.id)}>×</button>}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {isExpanded && (
                                      <div style={s.studentList}>
                                        {!classStudents[cls.id] && <p style={s.hint}>Ładowanie...</p>}
                                        {classStudents[cls.id]?.length === 0 && <p style={s.hint}>Brak uczniów w tej klasie.</p>}
                                        {classStudents[cls.id]?.map(student => (
                                          <div key={student.uid} style={s.studentRow}>
                                            <div style={s.studentAvatar}>{student.firstName?.[0] ?? '?'}</div>
                                            <div style={{ flex: 1 }}>
                                              <p style={s.rowName}>{student.firstName} {student.lastName}</p>
                                              <p style={s.rowMeta}>{student.email}</p>
                                            </div>
                                            <button style={s.deleteBtn} onClick={() => handleRemoveStudent(cls.id, student.uid)}>Usuń z klasy</button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </section>

                          <section style={s.envPanel}>
                            <div style={s.panelHeading}>
                              <h3 style={s.panelTitle}>Nauczyciele</h3>
                              <span style={s.panelCount}>{envTeachers.length}</span>
                            </div>
                            <div style={s.compactList}>
                              {envTeachers.length === 0 && <p style={s.hint}>Brak nauczycieli w tym środowisku.</p>}
                              {envTeachers.map(teacher => {
                                const teacherClasses = envClasses.filter(cls => teacherTeachesClass(teacher.id, cls) || teacherIsHomeroom(teacher.id, cls))
                                return (
                                  <div key={teacher.id} style={s.compactRow}>
                                    <div style={{ flex: 1 }}>
                                      <p style={s.rowName}>{displayUserName(teacher)}</p>
                                      <p style={s.rowMeta}>{teacher.email} · {teacherSubjectNames(teacher)}</p>
                                      <p style={s.rowMeta}>Klasy: {teacherClasses.length ? teacherClasses.map(cls => cls.name).join(', ') : 'brak klas'}</p>
                                    </div>
                                    <button style={s.iconBtn} onClick={() => { setTab('users'); handleEditUser(teacher) }}>Profil</button>
                                    <button style={s.deleteBtn} onClick={() => handleDeleteUser(teacher)}>Usuń</button>
                                  </div>
                                )
                              })}
                            </div>
                          </section>

                          <section style={s.envPanel}>
                            <div style={s.panelHeading}>
                              <h3 style={s.panelTitle}>Uczniowie</h3>
                              <span style={s.panelCount}>{envStudents.length}</span>
                            </div>
                            <div style={s.scrollList}>
                              {envStudents.length === 0 && <p style={s.hint}>Brak uczniów w tym środowisku.</p>}
                              {envStudents.map(student => {
                                const assignedClasses = envClasses.filter(cls => (cls.studentIds || []).includes(student.id))
                                return (
                                  <div key={student.id} style={s.compactRow}>
                                    <div style={{ flex: 1 }}>
                                      <p style={s.rowName}>{displayUserName(student)}</p>
                                      <p style={s.rowMeta}>{student.email}</p>
                                      <p style={s.rowMeta}>Klasy: {assignedClasses.length ? assignedClasses.map(cls => cls.name).join(', ') : 'nieprzypisany'}</p>
                                    </div>
                                    <button style={s.iconBtn} onClick={() => { setTab('users'); handleEditUser(student) }}>Profil</button>
                                    <button style={s.deleteBtn} onClick={() => handleDeleteUser(student)}>Usuń</button>
                                  </div>
                                )
                              })}
                            </div>
                          </section>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ===== UŻYTKOWNICY ===== */}
        {tab === 'users' && (
          <>
            <div style={s.card}>
              <h2 style={s.cardTitle}>➕ Nowy użytkownik</h2>
              <form onSubmit={handleCreateUser} style={s.formRow}>
                <input placeholder="Imię" style={s.input} value={userForm.firstName}
                  onChange={e => setUserForm(p => ({ ...p, firstName: e.target.value }))} required />
                <input placeholder="Nazwisko" style={s.input} value={userForm.lastName}
                  onChange={e => setUserForm(p => ({ ...p, lastName: e.target.value }))} required />
                <input type="email" placeholder="Email" style={s.input} value={userForm.email}
                  onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))} required />
                <input type="password" placeholder="Hasło (min. 6)" style={s.input} value={userForm.password}
                  onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
                <select style={s.input} value={userForm.role}
                  onChange={e => setUserForm(p => ({ ...p, role: e.target.value }))}>
                  {USER_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                </select>
                <select style={s.input} value={userForm.environmentId}
                  onChange={e => setUserForm(p => ({ ...p, environmentId: e.target.value }))}>
                  {environmentOptions.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                </select>
                {userForm.role !== 'student' && (
                  <input placeholder="Przedmioty po przecinku, np. Matematyka, Fizyka" style={s.inputWide} value={userForm.subject}
                    onChange={e => setUserForm(p => ({ ...p, subject: e.target.value }))} required />
                )}
                <button type="submit" style={s.btn} disabled={loadingU}>{loadingU ? '...' : 'Dodaj użytkownika'}</button>
              </form>
              {userMsg && <p style={{ color: userMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 8 }}>{userMsg}</p>}
            </div>

            {editingUser && (
              <div style={s.profileEditor}>
                <div style={s.cardHeaderBlock}>
                  <div>
                    <p style={s.sectionEyebrow}>Profil użytkownika</p>
                    <h2 style={s.cardTitle}>{editingUser.firstName || editingUser.email} {editingUser.lastName}</h2>
                  </div>
                  <button style={s.cancelBtn} onClick={() => setEditingUser(null)}>Zamknij</button>
                </div>
                <div style={s.formRow}>
                  <input style={s.input} placeholder="Imię" value={editingUser.firstName}
                    onChange={(event) => setEditingUser(prev => ({ ...prev, firstName: event.target.value }))} />
                  <input style={s.input} placeholder="Nazwisko" value={editingUser.lastName}
                    onChange={(event) => setEditingUser(prev => ({ ...prev, lastName: event.target.value }))} />
                  <input style={s.input} placeholder="Email" value={editingUser.email}
                    onChange={(event) => setEditingUser(prev => ({ ...prev, email: event.target.value }))} />
                  <select style={s.input} value={editingUser.role}
                    onChange={(event) => setEditingUser(prev => ({ ...prev, role: event.target.value }))}>
                    {USER_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                  </select>
                  <select style={s.input} value={editingUser.environmentId}
                    onChange={(event) => setEditingUser(prev => ({ ...prev, environmentId: event.target.value }))}>
                    {environmentOptions.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                  </select>
                  {editingUser.role !== 'student' && (
                    <input style={s.inputWide} placeholder="Przedmioty po przecinku, np. Matematyka, Fizyka" value={editingUser.subjectsText}
                      onChange={(event) => setEditingUser(prev => ({ ...prev, subjectsText: event.target.value }))} />
                  )}
                </div>
                <div style={s.profileActions}>
                  <button style={s.btn} onClick={handleSaveUserProfile}>Zapisz profil</button>
                  <button style={s.iconBtn} onClick={() => handleResetUserPassword(editingUser)}>Reset hasła</button>
                  <button style={s.deleteBtn} onClick={() => handleDeleteUser(editingUser)}>Usuń użytkownika</button>
                </div>
                {resetStatuses[editingUser.id]?.msg && <p style={{ color: resetStatuses[editingUser.id].msg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 8 }}>{resetStatuses[editingUser.id].msg}</p>}
              </div>
            )}

            <div style={s.list}>
              {allUsers.length === 0 && <p style={s.hint}>Brak użytkowników.</p>}
              {allUsers.map((user) => (
                <div key={user.id} style={s.listRow}>
                  <div style={s.rowAvatar}>{displayUserName(user)[0]?.toUpperCase() || '?'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={s.rowName}>{displayUserName(user)}</p>
                    <p style={s.rowMeta}>{user.email || 'brak emaila'} · {USER_ROLES.find(role => role.value === user.role)?.label || user.role || 'użytkownik'}</p>
                    <p style={s.rowMeta}>{environmentOf(user.environmentId).name}{user.subject ? ` · ${user.subject}` : ''}</p>
                  </div>
                  <select
                    style={{ ...s.input, flex: '0 1 220px' }}
                    value={user.environmentId || 'default'}
                    onChange={(event) => handleMoveUserEnvironment(user, event.target.value)}
                  >
                    {environmentOptions.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                  </select>
                  <button style={s.iconBtn} onClick={() => handleEditUser(user)}>Profil</button>
                  <button style={s.iconBtn} disabled={resetStatuses[user.id]?.loading} onClick={() => handleResetUserPassword(user)}>
                    {resetStatuses[user.id]?.loading ? '...' : 'Reset hasła'}
                  </button>
                  <button style={s.deleteBtn} onClick={() => handleDeleteUser(user)}>Usuń</button>
                  {resetStatuses[user.id]?.msg && <p style={{ flexBasis: '100%', color: resetStatuses[user.id].msg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 12, margin: '2px 0 0 48px' }}>{resetStatuses[user.id].msg}</p>}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === 'analytics' && (
          <>
            <div style={s.card}>
              <div style={s.cardHeaderBlock}>
                <div>
                  <p style={s.sectionEyebrow}>Amplitude</p>
                  <h2 style={s.cardTitle}>Podgląd analityki</h2>
                </div>
                {amplitudeDashboardUrl && (
                  <a href={amplitudeDashboardUrl} target="_blank" rel="noreferrer" style={s.linkBtn}>Otwórz w Amplitude</a>
                )}
              </div>

              {!amplitudeEmbedUrl ? (
                <p style={s.hint}>
                  Dodaj URL dashboardu do <strong>VITE_AMPLITUDE_DASHBOARD_URL</strong> lub URL embed do <strong>VITE_AMPLITUDE_EMBED_URL</strong> w pliku .env,
                  aby wyświetlić podgląd tutaj.
                </p>
              ) : (
                <div style={s.analyticsFrameWrap}>
                  <iframe
                    title="Amplitude Analytics"
                    src={amplitudeEmbedUrl}
                    style={s.analyticsFrame}
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              )}
            </div>
          </>
        )}

        {/* ===== NAUCZYCIELE ===== */}
        {tab === 'teachers' && (
          <>
            {/* Formularz dodawania */}
            <div style={s.card}>
              <h2 style={s.cardTitle}>➕ Nowy nauczyciel</h2>
              <form onSubmit={handleCreateTeacher} style={s.formRow}>
                <input placeholder="Imię" style={s.input} value={teacherForm.firstName}
                  onChange={e => setTeacherForm(p => ({ ...p, firstName: e.target.value }))} required />
                <input placeholder="Nazwisko" style={s.input} value={teacherForm.lastName}
                  onChange={e => setTeacherForm(p => ({ ...p, lastName: e.target.value }))} required />
                <input placeholder="Przedmiot nauczyciela" style={s.input} value={teacherForm.subject}
                  onChange={e => setTeacherForm(p => ({ ...p, subject: e.target.value }))} required />
                <input type="email" placeholder="Email" style={s.input} value={teacherForm.email}
                  onChange={e => setTeacherForm(p => ({ ...p, email: e.target.value }))} required />
                <input type="password" placeholder="Hasło (min. 6)" style={s.input} value={teacherForm.password}
                  onChange={e => setTeacherForm(p => ({ ...p, password: e.target.value }))} required minLength={6} />
                <select style={s.input} value={teacherForm.environmentId}
                  onChange={e => setTeacherForm(p => ({ ...p, environmentId: e.target.value }))}>
                  {environmentOptions.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                </select>
                <select style={s.input} value={teacherForm.role}
                  onChange={e => setTeacherForm(p => ({ ...p, role: e.target.value }))}>
                  <option value="teacher">Nauczyciel/prowadzący</option>
                  <option value="environment_admin">Admin środowiska</option>
                </select>
                <button type="submit" style={s.btn} disabled={loadingT}>
                  {loadingT ? '...' : 'Dodaj'}
                </button>
              </form>
              {teacherMsg && <p style={{ color: teacherMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 8 }}>{teacherMsg}</p>}
            </div>

            {/* Lista nauczycieli */}
            <div style={s.list}>
              {teachers.length === 0 && <p style={s.hint}>Brak nauczycieli.</p>}
              {teachers.map(t => {
                const teacherClasses = classes.filter(c => c.teacherId === t.id)
                const rst = resetStatuses[t.id] ?? {}
                return (
                  <div key={t.id} style={{ ...s.listRow, flexWrap: 'wrap', gap: 8 }}>
                    <div style={s.rowAvatar}>{t.firstName?.[0] ?? '?'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={s.rowName}>{t.firstName} {t.lastName}</p>
                      <p style={s.rowMeta}>{t.email} &nbsp;·&nbsp; {t.subject || 'brak przedmiotu'} &nbsp;·&nbsp;
                        {teacherClasses.length > 0
                          ? teacherClasses.map(c => c.name).join(', ')
                          : <span style={{ color: '#9ca3af' }}>brak klas</span>}
                      </p>
                      <p style={s.rowMeta}>{environmentOf(t.environmentId).name} · {t.role === 'environment_admin' ? 'admin środowiska' : 'nauczyciel'}</p>
                      {rst.msg && <p style={{ fontSize: 12, marginTop: 4, color: rst.msg.startsWith('✅') ? '#16a34a' : '#dc2626' }}>{rst.msg}</p>}
                    </div>
                    <button style={s.iconBtn} disabled={rst.loading} onClick={() => handleResetPassword(t)}>
                      {rst.loading ? '...' : '🔑 Reset hasła'}
                    </button>
                    <button style={s.deleteBtn} onClick={() => handleDeleteTeacher(t)}>Usuń</button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ===== KLASY ===== */}
        {tab === 'classes' && (
          <>
            {/* Formularz dodawania */}
            <div style={s.card}>
              <h2 style={s.cardTitle}>➕ Nowa klasa</h2>
              <form onSubmit={handleCreateClass} style={s.formRow}>
                <input placeholder="Nazwa klasy" style={s.input} value={classForm.name}
                  onChange={e => setClassForm(p => ({ ...p, name: e.target.value }))} required />
                <select style={s.input} value={classForm.environmentId}
                  onChange={e => setClassForm(p => ({ ...p, environmentId: e.target.value }))} required>
                  {environmentOptions.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                </select>
                <select style={s.input} value={classForm.teacherId}
                  onChange={e => setClassForm(p => ({ ...p, teacherId: e.target.value }))} required>
                  <option value="">— Wybierz nauczyciela i jego przedmiot —</option>
                  {teachers
                    .filter(t => (t.environmentId || 'default') === classForm.environmentId)
                    .map(t => (
                    <option key={t.id} value={t.id}>{t.firstName} {t.lastName} — {t.subject || 'brak przedmiotu'}</option>
                  ))}
                </select>
                <button type="submit" style={s.btn} disabled={loadingC || teachers.length === 0}>
                  {loadingC ? '...' : 'Dodaj'}
                </button>
              </form>
              {classMsg && <p style={{ color: classMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 8 }}>{classMsg}</p>}
            </div>

            {/* Lista klas */}
            <div style={s.list}>
              {classes.length === 0 && <p style={s.hint}>Brak klas.</p>}
              {classes.map(cls => {
                const t = teacherOf(cls.teacherId)
                const isExpanded = expandedClass === cls.id
                const isEditing = editingClass?.id === cls.id
                return (
                  <div key={cls.id} style={s.classCard}>
                    {/* Nagłówek */}
                    <div style={s.classHeader}>
                      <div style={{ flex: 1 }}>
                        <p style={s.rowName}>{cls.name} — {cls.subject}</p>
                        <p style={s.rowMeta}>
                          {t ? `${t.firstName} ${t.lastName}` : '—'} &nbsp;·&nbsp;
                          {cls.studentIds?.length ?? 0} uczniów &nbsp;·&nbsp; {environmentOf(cls.environmentId).name}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={s.iconBtn} onClick={() => { handleEditClass(cls); setExpandedClass(null) }}>✏️ Edytuj</button>
                        <button style={s.iconBtn} onClick={() => { toggleExpandClass(cls); setEditingClass(null) }}>
                          {isExpanded ? '▲ Uczniowie' : '▼ Uczniowie'}
                        </button>
                        <button style={s.deleteBtn} onClick={() => handleDeleteClass(cls)}>Usuń</button>
                      </div>
                    </div>

                    {/* Formularz edycji */}
                    {isEditing && (
                      <div style={s.editBox}>
                        <div style={s.formRow}>
                          <input style={s.input} value={editingClass.name}
                            onChange={e => setEditingClass(p => ({ ...p, name: e.target.value }))} placeholder="Nazwa" />
                          <select style={s.input} value={editingClass.environmentId || 'default'}
                            onChange={e => setEditingClass(p => ({ ...p, environmentId: e.target.value, teacherId: '' }))}>
                            {environmentOptions.map(env => <option key={env.id} value={env.id}>{env.name}</option>)}
                          </select>
                          <select style={s.input} value={editingClass.teacherId}
                            onChange={e => setEditingClass(p => ({ ...p, teacherId: e.target.value }))}>
                            {teachers
                              .filter(t => (t.environmentId || 'default') === (editingClass.environmentId || 'default'))
                              .map(t => (
                              <option key={t.id} value={t.id}>{t.firstName} {t.lastName} — {t.subject || 'brak przedmiotu'}</option>
                            ))}
                          </select>
                          <button style={s.btn} onClick={handleSaveEdit}>Zapisz</button>
                          <button style={s.cancelBtn} onClick={() => setEditingClass(null)}>Anuluj</button>
                        </div>
                        {editMsg && <p style={{ color: editMsg.startsWith('✅') ? '#16a34a' : '#dc2626', fontSize: 13, marginTop: 6 }}>{editMsg}</p>}
                      </div>
                    )}

                    {/* Lista uczniów */}
                    {isExpanded && (
                      <div style={s.studentList}>
                        {!classStudents[cls.id] && <p style={s.hint}>Ładowanie...</p>}
                        {classStudents[cls.id]?.length === 0 && <p style={s.hint}>Brak uczniów w tej klasie.</p>}
                        {classStudents[cls.id]?.map(student => (
                          <div key={student.uid} style={s.studentRow}>
                            <div style={s.studentAvatar}>{student.firstName?.[0] ?? '?'}</div>
                            <div style={{ flex: 1 }}>
                              <p style={s.rowName}>{student.firstName} {student.lastName}</p>
                              <p style={s.rowMeta}>{student.email}</p>
                            </div>
                            <button style={s.deleteBtn} onClick={() => handleRemoveStudent(cls.id, student.uid)}>
                              Usuń z klasy
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: 'linear-gradient(180deg, #eef6ff 0%, #f8fafc 260px, #f9fafb 100%)', fontFamily: 'sans-serif' },
  loginBox: { maxWidth: 360, margin: '100px auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 32px', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' },
  logo: { fontSize: 24, fontWeight: 700, color: '#2563eb', margin: 0 },
  adminLabel: { fontSize: 13, color: '#6b7280', margin: '0 0 8px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 32px', background: 'rgba(255,255,255,.88)', borderBottom: '1px solid rgba(148,163,184,.28)', backdropFilter: 'blur(14px)', position: 'sticky', top: 0, zIndex: 5 },
  brandBlock: { display: 'flex', alignItems: 'center', gap: 14 },
  headerKicker: { margin: 0, color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' },
  headerTitle: { margin: '2px 0 0', color: '#0f172a', fontSize: 20, fontWeight: 900 },
  headerActions: { display: 'flex', alignItems: 'center', gap: 10 },
  tabCount: { fontSize: 13, color: '#6b7280', alignSelf: 'center' },
  logoutBtn: { background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: '8px 14px', color: '#334155', cursor: 'pointer', fontSize: 13, fontWeight: 800, boxShadow: '0 8px 20px rgba(15,23,42,.06)' },
  main: { maxWidth: 1180, margin: '0 auto', padding: '28px 24px 44px' },
  heroCard: { display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'center', background: '#0f172a', color: '#fff', borderRadius: 18, padding: '26px 28px', marginBottom: 18, boxShadow: '0 24px 70px rgba(15,23,42,.22)', flexWrap: 'wrap' },
  heroKicker: { margin: 0, color: '#93c5fd', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' },
  heroTitle: { margin: '6px 0 8px', fontSize: 28, lineHeight: 1.12, fontWeight: 900 },
  heroText: { margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.55, maxWidth: 560 },
  statStrip: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(92px, 1fr))', gap: 10, minWidth: 330 },
  statPill: { background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.16)', borderRadius: 14, padding: '14px 16px' },
  statValue: { display: 'block', fontSize: 26, fontWeight: 900, color: '#fff' },
  statLabel: { display: 'block', marginTop: 2, fontSize: 12, color: '#cbd5e1', fontWeight: 800 },
  tabs: { display: 'flex', gap: 10, marginBottom: 20, padding: 6, background: '#e2e8f0', borderRadius: 14, width: 'fit-content', maxWidth: '100%', flexWrap: 'wrap' },
  tabBtn: { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 14, fontWeight: 800, border: '1px solid transparent', borderRadius: 10, cursor: 'pointer', background: 'transparent', color: '#475569' },
  tabIcon: { fontSize: 15 },
  tabActive: { background: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', boxShadow: '0 10px 24px rgba(15,23,42,.08)' },
  card: { background: '#fff', border: '1px solid #dbe3f1', borderRadius: 16, padding: '20px 22px', marginBottom: 16, boxShadow: '0 14px 40px rgba(15,23,42,.06)' },
  cardHeaderBlock: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' },
  sectionEyebrow: { margin: 0, color: '#2563eb', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' },
  softBadge: { border: '1px solid #bfdbfe', color: '#1d4ed8', background: '#eff6ff', borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 900 },
  linkBtn: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', border: '1px solid #bfdbfe', color: '#1d4ed8', background: '#eff6ff', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 900 },
  cardTitle: { fontSize: 18, fontWeight: 900, color: '#0f172a', margin: '3px 0 0' },
  formRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '9px 13px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', flex: '1 1 160px', minWidth: 0 },
  inputWide: { padding: '9px 13px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', flex: '1 1 360px', minWidth: 0 },
  btn: { padding: '9px 20px', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn: { padding: '9px 16px', fontSize: 13, background: 'none', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', color: '#6b7280' },
  error: { color: '#dc2626', fontSize: 14, margin: 0 },
  hint: { color: '#9ca3af', fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 14 },
  listRow: { background: '#fff', border: '1px solid #dbe3f1', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 10px 28px rgba(15,23,42,.045)', flexWrap: 'wrap' },
  environmentCard: { background: '#fff', border: '1px solid #dbe3f1', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 44px rgba(15,23,42,.07)' },
  environmentHeader: { padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 14, background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)', flexWrap: 'wrap' },
  environmentTitleRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  environmentName: { fontSize: 18, fontWeight: 900, color: '#0f172a', margin: '0 0 2px' },
  statusBadge: { borderRadius: 999, padding: '3px 9px', background: '#dcfce7', color: '#166534', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' },
  environmentMetrics: { display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0' },
  metricChip: { display: 'inline-flex', borderRadius: 999, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#334155', padding: '5px 9px', fontSize: 12, fontWeight: 800 },
  environmentBody: { padding: 18, borderTop: '1px solid #e2e8f0', background: '#f8fafc' },
  envGrid: { display: 'grid', gridTemplateColumns: 'minmax(320px, 1.25fr) repeat(2, minmax(240px, .9fr))', gap: 14, alignItems: 'start' },
  envPanel: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, minHeight: 160 },
  panelHeading: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 },
  panelTitle: { margin: 0, color: '#0f172a', fontSize: 14, fontWeight: 900 },
  panelCount: { display: 'grid', placeItems: 'center', minWidth: 28, height: 24, borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 900 },
  compactList: { display: 'grid', gap: 9, marginTop: 12 },
  scrollList: { display: 'grid', gap: 9, marginTop: 12, maxHeight: 430, overflowY: 'auto', paddingRight: 4 },
  compactRow: { display: 'flex', gap: 10, alignItems: 'center', border: '1px solid #edf2f7', background: '#fbfdff', borderRadius: 12, padding: '10px 12px' },
  adminPicker: { flex: '0 1 330px', display: 'grid', gap: 8 },
  adminChips: { display: 'flex', gap: 6, flexWrap: 'wrap' },
  adminChip: { display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%', borderRadius: 999, background: '#ecfeff', color: '#0f766e', border: '1px solid #a5f3fc', padding: '5px 8px', fontSize: 12, fontWeight: 800 },
  chipRemoveBtn: { border: 'none', background: 'transparent', color: '#0f766e', cursor: 'pointer', fontWeight: 900, fontSize: 14, lineHeight: 1, padding: '0 2px' },
  subjectChips: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  subjectChip: { display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '5px 9px', fontSize: 12, fontWeight: 800 },
  mutedChip: { display: 'inline-flex', borderRadius: 999, background: '#f8fafc', color: '#94a3b8', border: '1px solid #e2e8f0', padding: '5px 9px', fontSize: 12, fontWeight: 800 },
  subjectEditor: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px solid #e5e7eb' },
  subjectList: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  profileEditor: { background: '#fff', border: '1px solid #bfdbfe', borderRadius: 16, padding: '20px 22px', marginBottom: 16, boxShadow: '0 18px 44px rgba(37,99,235,.12)' },
  profileActions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 },
  classCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 0 },
  classHeader: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  editBox: { borderTop: '1px solid #f3f4f6', padding: '14px 16px', background: '#fafafa' },
  studentList: { borderTop: '1px solid #f3f4f6', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  studentRow: { display: 'flex', alignItems: 'center', gap: 12 },
  rowAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  studentAvatar: { width: 30, height: 30, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, border: '1px solid #bfdbfe' },
  rowName: { fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 2px' },
  rowMeta: { fontSize: 12, color: '#6b7280', margin: 0 },
  deleteBtn: { padding: '6px 12px', fontSize: 12, fontWeight: 500, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  iconBtn: { padding: '6px 12px', fontSize: 12, fontWeight: 500, background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  analyticsFrameWrap: { width: '100%', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', background: '#fff' },
  analyticsFrame: { display: 'block', width: '100%', minHeight: 620, border: 'none', background: '#fff' },
}
