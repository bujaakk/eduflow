import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  doc, getDoc, collection, query, where, getDocs,
  addDoc, updateDoc, arrayRemove, arrayUnion, serverTimestamp, onSnapshot, deleteDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
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

const dateToUnix = (value) => toDateValue(value)?.getTime() ?? 0

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

const lessonPreview = (lesson) => {
  const candidate = [
    lesson?.summary,
    lesson?.description,
    lesson?.lessonSummary,
    lesson?.note,
    lesson?.notes,
  ].find((value) => typeof value === 'string' && value.trim())

  if (!candidate) return ''
  const firstLine = candidate
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean) || ''

  if (firstLine.length <= 140) return firstLine
  return `${firstLine.slice(0, 137)}...`
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

const studentsLabel = (count) => `${count} ${count === 1 ? 'uczeń' : 'uczniów'}`

export default function ClassView() {
  const { classId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const initialTab = searchParams.get('tab') === 'lessons' ? 'lessons' : 'students'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [pageError, setPageError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [teacherStudents, setTeacherStudents] = useState([])
  const [assignStudentId, setAssignStudentId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState('')

  const [showLessonModal, setShowLessonModal] = useState(false)
  const [lessonForm, setLessonForm] = useState({ title: '', summary: '' })
  const [lessonLoading, setLessonLoading] = useState(false)
  const [lessonError, setLessonError] = useState('')
  const [lessonDeleteLoadingId, setLessonDeleteLoadingId] = useState('')
  const [confirmDeleteLessonId, setConfirmDeleteLessonId] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(null)

  useEffect(() => {
    const tab = searchParams.get('tab') === 'lessons' ? 'lessons' : 'students'
    if (tab !== activeTab) setActiveTab(tab)
  }, [searchParams, activeTab])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab === 'lessons') {
      setSearchParams({ tab: 'lessons' })
      return
    }
    setSearchParams({})
  }

  useEffect(() => {
    if (!classId) return
    const classRef = doc(db, 'classes', classId)

    const unsubClass = onSnapshot(classRef, async (classDoc) => {
      if (!classDoc.exists()) {
        setCls(null)
        setStudents([])
        setLoading(false)
        return
      }

      const classData = { id: classDoc.id, ...classDoc.data() }
      setCls(classData)
      setPageError('')
      setAssignError('')

      try {
        const ids = classData.studentIds ?? []

        const teacherIdForRoster = classData.teacherId || user?.uid
        const teacherStudentsSnap = teacherIdForRoster
          ? await getDocs(query(collection(db, 'students'), where('teacherId', '==', teacherIdForRoster)))
          : { docs: [] }
        const teacherRosterMap = {}
        teacherStudentsSnap.docs.forEach((studentDoc) => {
          teacherRosterMap[studentDoc.id] = { id: studentDoc.id, ...studentDoc.data() }
        })

        if (ids.length === 0) {
          setStudents([])
          setTeacherStudents(Object.values(teacherRosterMap))
          setLoading(false)
          return
        }

        const studentsData = await Promise.all(
          ids.map(async (uid) => {
            const snap = await getDoc(doc(db, 'students', uid))
            return snap.exists() ? { id: snap.id, ...snap.data() } : null
          })
        )
        const classStudents = studentsData.filter(Boolean)
        classStudents.forEach((student) => {
          teacherRosterMap[student.id] = student
        })

        setStudents(classStudents)
        setTeacherStudents(Object.values(teacherRosterMap))
      } catch {
        setPageError('Nie udało się załadować listy uczniów.')
      } finally {
        setLoading(false)
      }
    }, () => {
      setLoading(false)
      setPageError('Nie udało się załadować klasy. Sprawdź połączenie i reguły Firestore.')
    })

    const lessonsQuery = query(collection(db, 'lessons'), where('classId', '==', classId))
    const unsubLessons = onSnapshot(lessonsQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      list.sort((a, b) => dateToUnix(b.timestamp) - dateToUnix(a.timestamp))
      setLessons(list)
      setLessonsLoading(false)
    }, () => {
      setLessonsLoading(false)
      setPageError('Nie udało się załadować lekcji dla tej klasy.')
    })

    return () => {
      unsubClass()
      unsubLessons()
    }
  }, [classId])

  const handleAssignStudentToClass = async () => {
    if (!classId) {
      setAssignError('Nie wybrano klasy. Odśwież stronę i spróbuj ponownie.')
      return
    }
    if (!assignStudentId) {
      setAssignError('Wybierz ucznia z listy nauczyciela.')
      return
    }

    const selectedStudent = teacherStudents.find((student) => student.id === assignStudentId)
    if (!selectedStudent) {
      setAssignError('Nie znaleziono wybranego ucznia na liście.')
      return
    }

    if (!user?.uid) {
      setAssignError('Brak sesji nauczyciela. Odśwież stronę i zaloguj się ponownie.')
      return
    }

    setAssignLoading(true)
    setAssignError('')
    try {
      const previousClassIds = Array.isArray(selectedStudent.classIds)
        ? selectedStudent.classIds
        : (selectedStudent.classId ? [selectedStudent.classId] : [])

      await updateDoc(doc(db, 'students', selectedStudent.id), {
        classId,
        classIds: arrayUnion(classId),
        teacherId: user.uid,
      })

      await updateDoc(doc(db, 'classes', classId), {
        studentIds: arrayUnion(selectedStudent.id),
      })

      await Promise.all(previousClassIds
        .filter((id) => id && id !== classId)
        .map((id) => updateDoc(doc(db, 'classes', id), { studentIds: arrayRemove(selectedStudent.id) })))

      setShowModal(false)
      setAssignStudentId('')
    } catch (err) {
      if (err?.code === 'permission-denied') {
        setAssignError('Brak uprawnień do przypisania ucznia. Sprawdź reguły Firestore.')
      } else {
        setAssignError('Nie udało się przypisać ucznia do klasy. Spróbuj ponownie.')
      }
    } finally {
      setAssignLoading(false)
    }
  }

  const handleAddLesson = async () => {
    const title = lessonForm.title.trim()
    const summary = lessonForm.summary.trim()
    if (!title) return

    setLessonLoading(true)
    setLessonError('')
    try {
      await addDoc(collection(db, 'lessons'), {
        classId,
        teacherId: user.uid,
        title,
        summary,
        transcript: '',
        note: '',
        timestamp: serverTimestamp(),
        source: 'manual',
      })
      setLessonForm({ title: '', summary: '' })
      setShowLessonModal(false)
      handleTabChange('lessons')
    } catch {
      setLessonError('Nie udało się dodać lekcji. Spróbuj ponownie.')
    } finally {
      setLessonLoading(false)
    }
  }

  const handleRemoveStudent = async (studentId) => {
    try {
      await updateDoc(doc(db, 'classes', classId), {
        studentIds: arrayRemove(studentId),
      })

      const studentRef = doc(db, 'students', studentId)
      const studentSnap = await getDoc(studentRef)
      if (studentSnap.exists()) {
        const data = studentSnap.data()
        const currentClassIds = Array.isArray(data.classIds) ? data.classIds : []
        const nextClassIds = currentClassIds.filter((id) => id !== classId)
        await updateDoc(studentRef, {
          classIds: arrayRemove(classId),
          classId: data.classId === classId ? (nextClassIds[0] || '') : data.classId,
        })
      }

      setStudents(prev => prev.filter(s => s.id !== studentId))
      setConfirmDelete(null)
    } catch {
      setPageError('Nie udało się usunąć ucznia z tej klasy.')
    }
  }

  const handleDeleteLesson = async (lessonId) => {
    if (!lessonId) return
    setLessonError('')
    setLessonDeleteLoadingId(lessonId)

    try {
      const tasksSnap = await getDocs(query(collection(db, 'tasks'), where('lessonId', '==', lessonId)))
      for (const taskDoc of tasksSnap.docs) {
        const answersSnap = await getDocs(query(collection(db, 'answers'), where('taskId', '==', taskDoc.id)))
        await Promise.all(answersSnap.docs.map((answerDoc) => deleteDoc(doc(db, 'answers', answerDoc.id))))
        await deleteDoc(doc(db, 'tasks', taskDoc.id))
      }

      await deleteDoc(doc(db, 'lessons', lessonId))
      setLessons((prev) => prev.filter((lesson) => lesson.id !== lessonId))
      setConfirmDeleteLessonId('')
    } catch {
      setLessonError('Nie udało się usunąć lekcji. Spróbuj ponownie.')
    } finally {
      setLessonDeleteLoadingId('')
    }
  }

  if (loading) return <div style={s.page}><p style={s.hint}>Ładowanie...</p></div>
  if (!cls) return <div style={s.page}><p style={s.hint}>Nie znaleziono klasy.</p></div>
  const classStudentIds = new Set(students.map((student) => student.id))
  const availableStudents = teacherStudents
    .filter((student) => !classStudentIds.has(student.id))
    .sort((a, b) => (`${a.firstName ?? ''} ${a.lastName ?? ''} ${a.email ?? ''}`)
      .localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''} ${b.email ?? ''}`, 'pl'))

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate('/teacher')}>← Wróć</button>
          <Logo height={26} />
        </div>
      </header>

      <main className="app-main">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Klasa</p>
            <h1 className="page-title" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>{cls.name}</h1>
            <p className="page-subtitle">{cls.subject} · {studentsLabel(students.length)} · {lessons.length} lekcji</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-light" onClick={() => setShowLessonModal(true)}>+ Dodaj lekcję</button>
            <button className="btn btn-light" onClick={() => setShowModal(true)}>+ Przypisz ucznia</button>
          </div>
        </section>

        {pageError && <div className="ui-card" style={{ padding: 14, color: '#dc2626', marginBottom: 12 }}>{pageError}</div>}

        <div style={s.tabWrap}>
          <button className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleTabChange('students')}>
            Uczniowie
          </button>
          <button className={`btn ${activeTab === 'lessons' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleTabChange('lessons')}>
            Lekcje
          </button>
        </div>

        {activeTab === 'students' && (
          <section className="ui-card" style={{ padding: 18 }}>
            {students.length === 0 ? (
              <IllustrationState
                type="inviteStudents"
                title="Brak uczniów w tej klasie"
                text="Przypisz ucznia z głównej listy nauczyciela do tej klasy."
                action={<button className="btn btn-primary" onClick={() => setShowModal(true)}>Przypisz ucznia</button>}
              />
            ) : (
              <div style={s.studentGrid}>
                {students.map(student => {
                  const fullName = `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()
                  const displayName = fullName || student.email || 'Uczeń bez nazwy'
                  const initials = fullName
                    ? `${student.firstName?.[0] ?? ''}${student.lastName?.[0] ?? ''}`.toUpperCase()
                    : (student.email?.[0] ?? '?').toUpperCase()

                  return (
                  <article
                    key={student.id}
                    className="ui-card"
                    style={s.studentCard}
                    onClick={() => navigate(`/teacher/student/${student.id}`)}
                  >
                    <div style={s.studentTop}>
                      <div style={s.avatar}>{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <button style={s.nameLink} onClick={() => navigate(`/teacher/student/${student.id}`)}>
                          {displayName}
                        </button>
                        <p style={s.meta}>{student.email}</p>
                      </div>
                    </div>
                    <div style={s.profileMetaGrid}>
                      <span style={s.profileMetaLabel}>Dołączył</span>
                      <span style={s.profileMetaValue}>{student.joinedAt?.toDate ? student.joinedAt.toDate().toLocaleDateString('pl-PL') : '—'}</span>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      {confirmDelete === student.id ? (
                        <span style={{ fontSize: 13 }}>
                          Usunąć?{' '}
                          <button style={s.dangerBtn} onClick={(e) => { e.stopPropagation(); handleRemoveStudent(student.id) }}>Tak</button>{' '}
                          <button style={s.cancelBtn} onClick={(e) => { e.stopPropagation(); setConfirmDelete(null) }}>Nie</button>
                        </span>
                      ) : (
                        <button style={s.deleteBtn} onClick={(e) => { e.stopPropagation(); setConfirmDelete(student.id) }}>Usuń z klasy</button>
                      )}
                    </div>
                  </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'lessons' && (
          <section className="ui-card" style={{ padding: 18 }}>
            <div style={s.lessonHeader}>
              <h2 style={s.subTitle}>Lekcje klasy</h2>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => navigate('/teacher/record')}>Nagraj lekcję</button>
                <button className="btn btn-primary" onClick={() => setShowLessonModal(true)}>Dodaj lekcję</button>
              </div>
            </div>
            {lessonsLoading ? (
              <p className="empty-state">Ładowanie lekcji...</p>
            ) : lessons.length === 0 ? (
              <IllustrationState
                type="noLessons"
                title="Brak lekcji w tej klasie"
                text="Dodaj lekcję ręcznie albo rozpocznij nagranie i przypisz materiał do tej klasy."
                action={(
                  <>
                    <button className="btn btn-secondary" onClick={() => navigate('/teacher/record')}>Nagraj lekcję</button>
                    <button className="btn btn-primary" onClick={() => setShowLessonModal(true)}>Dodaj lekcję</button>
                  </>
                )}
              />
            ) : (
              <div style={s.lessonList}>
                {lessons.map(lesson => {
                  const lessonNumber = lessons
                    .slice()
                    .sort((a, b) => lessonToUnix(a) - lessonToUnix(b))
                    .findIndex((item) => item.id === lesson.id) + 1
                  const displayTitle = formatDisplayTitle(lesson.title, lessonNumber)
                  const lessonDate = resolveLessonDate(lesson)
                  const previewText = lessonPreview(lesson)

                  return (
                    <article
                      key={lesson.id}
                      className="ui-card"
                      style={s.lessonCard}
                      onClick={() => navigate(`/teacher/lesson/${lesson.id}`)}
                    >
                      <button style={s.lessonLink} onClick={(e) => { e.stopPropagation(); navigate(`/teacher/lesson/${lesson.id}`) }}>
                        {displayTitle}
                      </button>
                      {previewText && <p style={s.meta}>{previewText}</p>}
                      <p style={s.meta}>Data: {formatDateTime(lessonDate)}</p>
                      <div style={{ marginTop: 8 }}>
                        {confirmDeleteLessonId === lesson.id ? (
                          <span style={{ fontSize: 13 }}>
                            Usunąć lekcję?{' '}
                            <button
                              style={s.dangerBtn}
                              onClick={(e) => { e.stopPropagation(); handleDeleteLesson(lesson.id) }}
                              disabled={lessonDeleteLoadingId === lesson.id}
                            >
                              {lessonDeleteLoadingId === lesson.id ? 'Usuwanie...' : 'Tak'}
                            </button>{' '}
                            <button
                              style={s.cancelBtn}
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteLessonId('') }}
                              disabled={lessonDeleteLoadingId === lesson.id}
                            >
                              Nie
                            </button>
                          </span>
                        ) : (
                          <button
                            style={s.deleteBtn}
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteLessonId(lesson.id) }}
                            disabled={lessonDeleteLoadingId === lesson.id}
                          >
                            Usuń lekcję
                          </button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modal przypisz ucznia */}
      {showModal && (
        <div style={s.overlay} onClick={() => setShowModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>Przypisz ucznia do klasy</h2>
            <p style={s.modalHint}>Uczniowie pochodzą z Twojej głównej listy w panelu nauczyciela.</p>
            <select
              value={assignStudentId}
              onChange={(e) => {
                if (assignError) setAssignError('')
                setAssignStudentId(e.target.value)
              }}
              style={s.input}
            >
              <option value="">Wybierz ucznia</option>
              {availableStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {(student.firstName || student.lastName)
                    ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()
                    : student.email}
                  {student.email ? ` — ${student.email}` : ''}
                </option>
              ))}
            </select>
            {availableStudents.length === 0 && (
              <p style={s.modalHint}>
                Brak dostępnych uczniów. Najpierw dodaj ucznia w panelu głównym nauczyciela.
              </p>
            )}
            {assignError && <p style={s.error}>{assignError}</p>}
            <div style={s.modalBtns}>
              <button style={s.cancelModalBtn} onClick={() => { setShowModal(false); setAssignStudentId(''); setAssignError('') }}>
                Anuluj
              </button>
              <button style={s.primaryBtn} onClick={handleAssignStudentToClass} disabled={assignLoading || availableStudents.length === 0}>
                {assignLoading ? 'Przypisywanie...' : 'Przypisz ucznia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dodaj lekcję */}
      {showLessonModal && (
        <div style={s.overlay} onClick={() => setShowLessonModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>Dodaj lekcję</h2>
            <p style={s.modalHint}>Ta lekcja będzie widoczna w zakładce „Lekcje” tej klasy.</p>
            <input
              type="text"
              placeholder="Tytuł lekcji"
              value={lessonForm.title}
              onChange={e => setLessonForm(prev => ({ ...prev, title: e.target.value }))}
              style={s.input}
            />
            <textarea
              placeholder="Krótki opis (opcjonalnie)"
              value={lessonForm.summary}
              onChange={e => setLessonForm(prev => ({ ...prev, summary: e.target.value }))}
              style={{ ...s.input, marginTop: 10, minHeight: 110, resize: 'vertical' }}
            />
            {lessonError && <p style={s.error}>{lessonError}</p>}
            <div style={s.modalBtns}>
              <button style={s.cancelModalBtn} onClick={() => { setShowLessonModal(false); setLessonForm({ title: '', summary: '' }); setLessonError('') }}>
                Anuluj
              </button>
              <button style={s.primaryBtn} onClick={handleAddLesson} disabled={lessonLoading}>
                {lessonLoading ? 'Dodawanie...' : 'Dodaj lekcję'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  tabWrap: { display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' },
  studentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 },
  studentCard: { padding: 16, borderRadius: 18, border: '1px solid #dbe3f1', cursor: 'pointer' },
  studentTop: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0, color: '#fff', background: 'linear-gradient(135deg, #2563eb, #14b8a6)', fontWeight: 800, fontSize: 15 },
  profileMetaGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 },
  profileMetaLabel: { fontSize: 12, color: '#64748b', fontWeight: 700 },
  profileMetaValue: { fontSize: 13, color: '#0f172a', fontWeight: 700, textAlign: 'right' },
  lessonHeader: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  lessonList: { display: 'grid', gap: 10 },
  lessonCard: { padding: 14, borderRadius: 14, border: '1px solid #dbe3f1', cursor: 'pointer' },
  lessonTitle: { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 },
  lessonLink: { background: 'none', border: 'none', color: '#0f172a', cursor: 'pointer', fontSize: 16, fontWeight: 800, marginBottom: 6, padding: 0, textAlign: 'left' },
  subTitle: { fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 },
  primaryBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  hint: { color: '#9ca3af', fontSize: 14 },
  codeBanner: { position: 'fixed', right: 16, bottom: 16, zIndex: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, width: 'min(560px, calc(100% - 32px))', padding: '16px 20px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, boxShadow: '0 14px 40px rgba(22, 163, 74, .2)' },
  codeBannerText: { fontSize: 14, color: '#14532d', lineHeight: 1.6 },
  codeDisplay: { display: 'inline-block', marginLeft: 10, padding: '4px 14px', background: '#fff', border: '2px solid #22c55e', borderRadius: 8, fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: 6, color: '#15803d' },
  codeCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', flexShrink: 0 },
  nameLink: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: 0, textAlign: 'left' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 4 },
  deleteBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 },
  dangerBtn: { background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 13 },
  cancelBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 13, marginLeft: 4 },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: '#fff', borderRadius: 16, padding: 32, width: 400, maxWidth: '90vw' },
  modalTitle: { fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#111827' },
  modalHint: { color: '#6b7280', fontSize: 13, marginBottom: 16 },
  input: { width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none', boxSizing: 'border-box' },
  error: { color: '#dc2626', fontSize: 13, marginTop: 6 },
  modalBtns: { display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' },
  cancelModalBtn: { background: 'none', border: '1px solid #d1d5db', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontSize: 14, color: '#374151' },
}
