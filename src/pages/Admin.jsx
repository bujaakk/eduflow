import { useState, useEffect } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../firebase'
import {
  collection, addDoc, getDocs, setDoc, doc, deleteDoc,
  updateDoc, arrayRemove, serverTimestamp, getDoc, onSnapshot, query, where
} from 'firebase/firestore'
import { db, firebaseConfig } from '../firebase'

const ADMIN_PASSWORD = 'hackaton'
import Logo from '../components/Logo'
const SESSION_KEY = 'eduflow_admin_auth'

const secondaryApp = getApps().find(a => a.name === 'admin') || initializeApp(firebaseConfig, 'admin')
const secondaryAuth = getAuth(secondaryApp)

export default function AdminPanel() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1')
  const [pw, setPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [tab, setTab] = useState('teachers') // 'teachers' | 'classes'

  const [teachers, setTeachers] = useState([])
  const [classes, setClasses] = useState([])

  const [teacherForm, setTeacherForm] = useState({ firstName: '', lastName: '', subject: '', email: '', password: '' })
  const [classForm, setClassForm] = useState({ name: '', teacherId: '' })
  const [teacherMsg, setTeacherMsg] = useState('')
  const [classMsg, setClassMsg] = useState('')
  const [adminError, setAdminError] = useState('')
  const [loadingT, setLoadingT] = useState(false)
  const [loadingC, setLoadingC] = useState(false)

  // Edycja klasy
  const [editingClass, setEditingClass] = useState(null) // {id, name, subject, teacherId}
  const [editMsg, setEditMsg] = useState('')

  // Reset hasła nauczyciela
  const [resetStatuses, setResetStatuses] = useState({}) // teacherId → { loading, msg }

  // Rozwinięta klasa (lista uczniów)
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

    const unsubClasses = onSnapshot(
      collection(db, 'classes'),
      (snap) => {
        setClasses(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setAdminError('')
      },
      () => setAdminError('❌ Nie udało się załadować klas. Sprawdź reguły Firestore lub połączenie.')
    )

    return () => {
      unsubTeachers()
      unsubClasses()
    }
  }, [authed])

  const fetchAll = async () => {
    try {
      const [tSnap, cSnap] = await Promise.all([
        getDocs(collection(db, 'teachers')),
        getDocs(collection(db, 'classes')),
      ])
      setTeachers(tSnap.docs.map(d => ({ id: d.id, ...d.data() })))
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

  // --- Tworzenie nauczyciela ---
  const handleCreateTeacher = async (e) => {
    e.preventDefault(); setTeacherMsg(''); setLoadingT(true)
    try {
      const { firstName, lastName, subject, email, password } = teacherForm
      let created = false
      let existingTeacherDoc = null

      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
        await setDoc(doc(db, 'teachers', cred.user.uid), { firstName, lastName, subject, email, createdAt: serverTimestamp() }, { merge: true })
        await secondaryAuth.signOut()
        created = true
      } catch (err) {
        if (err?.code !== 'auth/email-already-in-use') throw err

        const existingTeacherSnap = await getDocs(query(collection(db, 'teachers'), where('email', '==', email)))
        if (!existingTeacherSnap.empty) {
          existingTeacherDoc = existingTeacherSnap.docs[0]
          await setDoc(doc(db, 'teachers', existingTeacherDoc.id), {
            firstName,
            lastName,
            subject,
            email,
            updatedAt: serverTimestamp(),
          }, { merge: true })
        } else {
          throw err
        }
      }

      if (created) {
        setTeacherMsg(`✅ Nauczyciel ${firstName} ${lastName} dodany.`)
      } else if (existingTeacherDoc) {
        setTeacherMsg(`✅ Konto już istniało. Zaktualizowano dane nauczyciela (${email}).`)
      }
      setTeacherForm({ firstName: '', lastName: '', subject: '', email: '', password: '' })
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
    await deleteDoc(doc(db, 'teachers', teacher.id))
    setTeachers(prev => prev.filter(t => t.id !== teacher.id))
  }

  // --- Tworzenie klasy ---
  const handleCreateClass = async (e) => {
    e.preventDefault(); setClassMsg(''); setLoadingC(true)
    try {
      const { name, teacherId } = classForm
      const teacher = teachers.find(t => t.id === teacherId)
      if (!teacher?.subject) throw new Error('Najpierw przypisz przedmiot do nauczyciela.')
      await addDoc(collection(db, 'classes'), { name, subject: teacher.subject, teacherId, studentIds: [], createdAt: serverTimestamp() })
      setClassMsg(`✅ Klasa "${name}" dodana.`)
      setClassForm({ name: '', teacherId: '' })
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
      const teacher = teachers.find(t => t.id === editingClass.teacherId)
      if (!teacher?.subject) throw new Error('Wybrany nauczyciel nie ma przypisanego przedmiotu.')
      await updateDoc(doc(db, 'classes', editingClass.id), {
        name: editingClass.name,
        subject: teacher.subject,
        teacherId: editingClass.teacherId,
      })
      setEditMsg('✅ Zapisano.')
      setClasses(prev => prev.map(c => c.id === editingClass.id ? { ...c, ...editingClass, subject: teacher.subject } : c))
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
        <Logo height={26} />
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={s.tabCount}>👨‍🏫 {teachers.length} nauczycieli &nbsp;·&nbsp; 🏫 {classes.length} klas</span>
          <button style={s.logoutBtn} onClick={handleLogout}>Wyloguj</button>
        </div>
      </header>

      <main style={s.main}>
        {adminError && <p style={{ ...s.error, marginBottom: 12 }}>{adminError}</p>}

        {/* Zakładki */}
        <div style={s.tabs}>
          {['teachers', 'classes'].map(t => (
            <button key={t} style={{ ...s.tabBtn, ...(tab === t ? s.tabActive : {}) }} onClick={() => setTab(t)}>
              {t === 'teachers' ? '👨‍🏫 Nauczyciele' : '🏫 Klasy'}
            </button>
          ))}
        </div>

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
                <select style={s.input} value={classForm.teacherId}
                  onChange={e => setClassForm(p => ({ ...p, teacherId: e.target.value }))} required>
                  <option value="">— Wybierz nauczyciela i jego przedmiot —</option>
                  {teachers.map(t => (
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
                          {cls.studentIds?.length ?? 0} uczniów
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
                          <select style={s.input} value={editingClass.teacherId}
                            onChange={e => setEditingClass(p => ({ ...p, teacherId: e.target.value }))}>
                            {teachers.map(t => (
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
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  loginBox: { maxWidth: 360, margin: '100px auto', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '40px 32px', display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'center' },
  logo: { fontSize: 24, fontWeight: 700, color: '#2563eb', margin: 0 },
  adminLabel: { fontSize: 13, color: '#6b7280', margin: '0 0 8px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  tabCount: { fontSize: 13, color: '#6b7280', alignSelf: 'center' },
  logoutBtn: { background: 'none', border: '1px solid #e5e7eb', borderRadius: 8, padding: '6px 14px', color: '#6b7280', cursor: 'pointer', fontSize: 13 },
  main: { maxWidth: 960, margin: '0 auto', padding: '28px 24px' },
  tabs: { display: 'flex', gap: 8, marginBottom: 20 },
  tabBtn: { padding: '9px 20px', fontSize: 14, fontWeight: 500, border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', background: '#fff', color: '#374151' },
  tabActive: { background: '#2563eb', color: '#fff', border: '1px solid #2563eb' },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 14 },
  formRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '9px 13px', fontSize: 14, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', flex: '1 1 160px', minWidth: 0 },
  btn: { padding: '9px 20px', fontSize: 14, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap' },
  cancelBtn: { padding: '9px 16px', fontSize: 13, background: 'none', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'pointer', color: '#6b7280' },
  error: { color: '#dc2626', fontSize: 14, margin: 0 },
  hint: { color: '#9ca3af', fontSize: 13 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  listRow: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  classCard: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden', marginBottom: 0 },
  classHeader: { padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 },
  editBox: { borderTop: '1px solid #f3f4f6', padding: '14px 16px', background: '#fafafa' },
  studentList: { borderTop: '1px solid #f3f4f6', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 },
  studentRow: { display: 'flex', alignItems: 'center', gap: 12 },
  rowAvatar: { width: 36, height: 36, borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, flexShrink: 0 },
  studentAvatar: { width: 30, height: 30, borderRadius: '50%', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0, border: '1px solid #bfdbfe' },
  rowName: { fontSize: 14, fontWeight: 600, color: '#111827', margin: '0 0 2px' },
  rowMeta: { fontSize: 12, color: '#6b7280', margin: 0 },
  deleteBtn: { padding: '6px 12px', fontSize: 12, fontWeight: 500, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
  iconBtn: { padding: '6px 12px', fontSize: 12, fontWeight: 500, background: '#f9fafb', color: '#374151', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' },
}
