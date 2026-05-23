import Logo from '../../components/Logo'
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  doc, getDoc, collection, query, where, getDocs,
  addDoc, updateDoc, arrayRemove, arrayUnion, serverTimestamp, onSnapshot, deleteDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import { useEnvironment } from '../../contexts/EnvironmentContext'
import IllustrationState from '../../components/IllustrationState'
import { sanitizeGeneratedText } from '../../utils/contentSanitizer'
import { uploadPdfMaterial } from '../../services/pdfMaterialUpload'
import { classBelongsToTeacher, classSubjectLabel, classSubjectOptions, classSubjects, normalizeSubjectKey } from '../../utils/classModel'

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
  const firstLine = sanitizeGeneratedText(candidate)
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

const studentsLabel = (count) => `${count} ${count === 1 ? 'uczeń' : 'uczniów'}`

export default function ClassView() {
  const { classId } = useParams()
  const { user, teacherProfile } = useAuth()
  const { environmentId, isDefaultEnvironment, buildPath } = useEnvironment()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isEnvironmentAdmin = teacherProfile?.role === 'environment_admin'

  const [cls, setCls] = useState(null)
  const [students, setStudents] = useState([])
  const [lessons, setLessons] = useState([])
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const [materialsLoading, setMaterialsLoading] = useState(true)
  const requestedTab = searchParams.get('tab')
  const initialTab = ['students', 'lessons', 'materials'].includes(requestedTab) ? requestedTab : 'students'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [pageError, setPageError] = useState('')

  const [showModal, setShowModal] = useState(false)
  const [teacherStudents, setTeacherStudents] = useState([])
  const [assignStudentId, setAssignStudentId] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignError, setAssignError] = useState('')

  const [showLessonModal, setShowLessonModal] = useState(false)
  const [lessonForm, setLessonForm] = useState({ title: '', summary: '', subject: '' })
  const [lessonLoading, setLessonLoading] = useState(false)
  const [lessonError, setLessonError] = useState('')
  const [lessonDeleteLoadingId, setLessonDeleteLoadingId] = useState('')
  const [confirmDeleteLessonId, setConfirmDeleteLessonId] = useState('')
  const [showMaterialModal, setShowMaterialModal] = useState(false)
  const [pdfUploadTarget, setPdfUploadTarget] = useState('material')
  const [materialForm, setMaterialForm] = useState({ title: '', file: null, subject: '' })
  const [materialLoading, setMaterialLoading] = useState(false)
  const [materialError, setMaterialError] = useState('')
  const [materialInfo, setMaterialInfo] = useState('')
  const [envTeachers, setEnvTeachers] = useState([])
  const [subjectForm, setSubjectForm] = useState({ name: '', teacherId: '' })
  const [subjectSaving, setSubjectSaving] = useState(false)
  const [subjectError, setSubjectError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(null)
  const belongsToEnvironment = (row) => (row?.environmentId || 'default') === (isDefaultEnvironment ? 'default' : environmentId)

  useEffect(() => {
    const requested = searchParams.get('tab')
    const tab = ['students', 'lessons', 'materials'].includes(requested) ? requested : 'students'
    if (tab !== activeTab) setActiveTab(tab)
  }, [searchParams, activeTab])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    if (tab !== 'students') {
      setSearchParams({ tab })
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
      if (!belongsToEnvironment(classData)) {
        setCls(null)
        setStudents([])
        setTeacherStudents([])
        setLoading(false)
        return
      }
      if (!classBelongsToTeacher(classData, user?.uid, isEnvironmentAdmin)) {
        setCls(null)
        setStudents([])
        setTeacherStudents([])
        setPageError('Ta klasa nie jest przypisana do Twoich przedmiotow.')
        setLoading(false)
        return
      }
      setCls(classData)
      setPageError('')
      setAssignError('')

      try {
        const ids = classData.studentIds ?? []

        const rosterQuery = getDocs(collection(db, 'students'))
        const [rosterSnap, directClassSnap, classIdsSnap] = await Promise.all([
          rosterQuery,
          getDocs(query(collection(db, 'students'), where('classId', '==', classId))),
          getDocs(query(collection(db, 'students'), where('classIds', 'array-contains', classId))),
        ])

        const teacherRosterMap = {}
        rosterSnap.docs.forEach((studentDoc) => {
          if (!belongsToEnvironment(studentDoc.data())) return
          teacherRosterMap[studentDoc.id] = { id: studentDoc.id, ...studentDoc.data() }
        })

        const classRosterMap = {}
        directClassSnap.docs.forEach((studentDoc) => {
          if (!belongsToEnvironment(studentDoc.data())) return
          classRosterMap[studentDoc.id] = { id: studentDoc.id, ...studentDoc.data() }
        })
        classIdsSnap.docs.forEach((studentDoc) => {
          if (!belongsToEnvironment(studentDoc.data())) return
          classRosterMap[studentDoc.id] = { id: studentDoc.id, ...studentDoc.data() }
        })

        const studentsData = await Promise.all(
          ids.map(async (uid) => {
            if (classRosterMap[uid]) return classRosterMap[uid]
            const snap = await getDoc(doc(db, 'students', uid))
            return snap.exists() ? { id: snap.id, ...snap.data() } : null
          })
        )

        const classStudents = [
          ...studentsData.filter((student) => student && belongsToEnvironment(student)),
          ...Object.values(classRosterMap),
        ]
          .reduce((acc, student) => {
            acc[student.id] = student
            return acc
          }, {})

        Object.values(classStudents).forEach((student) => {
          teacherRosterMap[student.id] = student
        })

        const sortedClassStudents = Object.values(classStudents).sort((a, b) => (`${a.firstName ?? ''} ${a.lastName ?? ''} ${a.email ?? ''}`)
          .localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''} ${b.email ?? ''}`, 'pl'))
        const sortedTeacherStudents = Object.values(teacherRosterMap).sort((a, b) => (`${a.firstName ?? ''} ${a.lastName ?? ''} ${a.email ?? ''}`)
          .localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''} ${b.email ?? ''}`, 'pl'))

        setStudents(sortedClassStudents)
        setTeacherStudents(sortedTeacherStudents)
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
      const list = snap.docs.map(d => ({ id: d.id, ...d.data(), sourceCollection: 'lessons' }))
      list.sort((a, b) => dateToUnix(b.timestamp) - dateToUnix(a.timestamp))
      setLessons(list)
      setLessonsLoading(false)
    }, () => {
      setLessonsLoading(false)
      setPageError('Nie udało się załadować lekcji dla tej klasy.')
    })

    const materialsQuery = query(collection(db, 'materials'), where('classId', '==', classId))
    const unsubMaterials = onSnapshot(materialsQuery, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data(), sourceCollection: 'materials' }))
      list.sort((a, b) => dateToUnix(b.timestamp || b.createdAt) - dateToUnix(a.timestamp || a.createdAt))
      setMaterials(list)
      setMaterialsLoading(false)
    }, () => {
      setMaterialsLoading(false)
      setPageError('Nie udało się załadować materiałów dla tej klasy.')
    })

    return () => {
      unsubClass()
      unsubLessons()
      unsubMaterials()
    }
  }, [classId, environmentId, isDefaultEnvironment, user?.uid, isEnvironmentAdmin])

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
        environmentId,
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
        environmentId,
        className: cls?.name || '',
        classSubject: lessonForm.subject || classSubjectText,
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

  const handleUploadMaterial = async () => {
    if (!materialForm.file) {
      setMaterialError('Wybierz plik PDF.')
      return
    }

    setMaterialLoading(true)
    setMaterialError('')
    setMaterialInfo('')
    try {
      const title = materialForm.title.trim() || materialForm.file.name.replace(/\.pdf$/i, '')
      const result = await uploadPdfMaterial(
        materialForm.file,
        { ...cls, id: classId, classSubject: materialForm.subject || classSubjectText },
        { title, target: pdfUploadTarget }
      )
      const message = result?.payload?.message || (pdfUploadTarget === 'lesson'
        ? 'PDF wysłany do AI. Lekcja pojawi się w zakładce Lekcje po zapisaniu przez n8n.'
        : 'PDF wysłany do AI. Materiał pojawi się uczniom po zapisaniu notatki przez n8n.')
      setMaterialInfo(message)
      setMaterialForm({ title: '', file: null, subject: materialForm.subject || '' })
      setShowMaterialModal(false)
      handleTabChange(pdfUploadTarget === 'lesson' ? 'lessons' : 'materials')
    } catch (err) {
      setMaterialError(err?.message || 'Nie udało się wysłać PDF do AI.')
    } finally {
      setMaterialLoading(false)
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

  const handleDeleteMaterial = async (material) => {
    if (!material?.id) return
    setLessonError('')
    setLessonDeleteLoadingId(material.id)

    try {
      const sourceCollection = material.sourceCollection === 'lessons' ? 'lessons' : 'materials'
      await deleteDoc(doc(db, sourceCollection, material.id))
      if (sourceCollection === 'lessons') {
        setLessons((prev) => prev.filter((item) => item.id !== material.id))
      } else {
        setMaterials((prev) => prev.filter((item) => item.id !== material.id))
      }
      setConfirmDeleteLessonId('')
    } catch {
      setLessonError('Nie udało się usunąć materiału. Spróbuj ponownie.')
    } finally {
      setLessonDeleteLoadingId('')
    }
  }

  const classSubjectChoices = classSubjectOptions(cls, user?.uid, isEnvironmentAdmin)

  useEffect(() => {
    const fallback = classSubjectChoices[0]?.name || ''
    setLessonForm((prev) => {
      if (!showLessonModal) return prev
      if (prev.subject && classSubjectChoices.some((option) => option.name === prev.subject)) return prev
      return { ...prev, subject: fallback }
    })
    setMaterialForm((prev) => {
      if (!showMaterialModal) return prev
      if (prev.subject && classSubjectChoices.some((option) => option.name === prev.subject)) return prev
      return { ...prev, subject: fallback }
    })
  }, [classSubjectChoices, showLessonModal, showMaterialModal])

  const canManageSubjects = isEnvironmentAdmin || cls?.homeroomTeacherId === user?.uid

  useEffect(() => {
    if (!canManageSubjects) {
      setEnvTeachers([])
      return
    }

    let canceled = false
    const loadTeachers = async () => {
      try {
        const teachersSnap = await getDocs(collection(db, 'teachers'))
        if (canceled) return
        const rows = teachersSnap.docs
          .map((teacherDoc) => ({ id: teacherDoc.id, ...teacherDoc.data() }))
          .filter((teacherRow) => belongsToEnvironment(teacherRow))
          .sort((a, b) => `${a.firstName ?? ''} ${a.lastName ?? ''} ${a.email ?? ''}`
            .localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''} ${b.email ?? ''}`, 'pl'))
        setEnvTeachers(rows)
      } catch {
        if (!canceled) setSubjectError('Nie udało się załadować listy nauczycieli.')
      }
    }

    loadTeachers()
    return () => {
      canceled = true
    }
  }, [canManageSubjects, environmentId, isDefaultEnvironment])

  const teacherDisplayName = (teacherId) => {
    const teacher = envTeachers.find((row) => row.id === teacherId)
    if (!teacher) return teacherId ? 'Nauczyciel' : 'Nieprzypisany'
    const fullName = `${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim()
    return fullName || teacher.email || 'Nauczyciel'
  }

  const teacherSubjectSuggestions = (teacherId) => {
    const teacher = envTeachers.find((row) => row.id === teacherId)
    if (!teacher) return []
    return [...new Set([
      ...(Array.isArray(teacher.subjects) ? teacher.subjects : []),
      teacher.subject,
    ].map((value) => String(value || '').trim()).filter(Boolean))]
  }

  const saveClassSubjects = async (nextSubjects) => {
    const normalized = nextSubjects
      .map((subject, index) => ({
        id: subject?.id || `${normalizeSubjectKey(subject?.name) || 'subject'}-${index}`,
        name: String(subject?.name || '').trim(),
        teacherId: String(subject?.teacherId || '').trim(),
      }))
      .filter((subject) => subject.name)

    await updateDoc(doc(db, 'classes', classId), {
      subjects: normalized,
      subject: normalized[0]?.name || '',
      teacherId: normalized[0]?.teacherId || '',
    })

    setCls((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        subjects: normalized,
        subject: normalized[0]?.name || '',
        teacherId: normalized[0]?.teacherId || '',
      }
    })
  }

  const handleAssignSubjectTeacher = async () => {
    if (!canManageSubjects || !cls) return

    const subjectName = subjectForm.name.trim()
    if (!subjectName) {
      setSubjectError('Podaj nazwę przedmiotu.')
      return
    }
    if (!subjectForm.teacherId) {
      setSubjectError('Wybierz nauczyciela do przedmiotu.')
      return
    }

    setSubjectSaving(true)
    setSubjectError('')
    try {
      const currentSubjects = classSubjects(cls)
      const targetKey = normalizeSubjectKey(subjectName)
      const existingIndex = currentSubjects.findIndex((subject) => normalizeSubjectKey(subject?.name) === targetKey)
      const nextSubjects = [...currentSubjects]

      if (existingIndex >= 0) {
        nextSubjects[existingIndex] = {
          ...nextSubjects[existingIndex],
          name: subjectName,
          teacherId: subjectForm.teacherId,
        }
      } else {
        nextSubjects.push({
          id: `${targetKey || 'subject'}-${Date.now().toString(36)}`,
          name: subjectName,
          teacherId: subjectForm.teacherId,
        })
      }

      await saveClassSubjects(nextSubjects)
      setSubjectForm({ name: '', teacherId: '' })
    } catch {
      setSubjectError('Nie udało się zapisać przypisania przedmiotu.')
    } finally {
      setSubjectSaving(false)
    }
  }

  const handleRemoveSubject = async (subjectId) => {
    if (!canManageSubjects || !cls || !subjectId) return
    setSubjectSaving(true)
    setSubjectError('')
    try {
      const nextSubjects = classSubjects(cls).filter((subject) => (subject.id || '') !== subjectId)
      await saveClassSubjects(nextSubjects)
    } catch {
      setSubjectError('Nie udało się usunąć przedmiotu.')
    } finally {
      setSubjectSaving(false)
    }
  }

  if (loading) return <div style={s.page}><p style={s.hint}>Ładowanie...</p></div>
  if (!cls) return <div style={s.page}><p style={s.hint}>Nie znaleziono klasy.</p></div>
  const canSeeAllClassContent = isEnvironmentAdmin || cls?.homeroomTeacherId === user?.uid
  const visibleLessons = canSeeAllClassContent
    ? lessons
    : lessons.filter((lesson) => String(lesson?.teacherId || '') === String(user?.uid || ''))
  const visibleMaterials = canSeeAllClassContent
    ? materials
    : materials.filter((material) => String(material?.teacherId || '') === String(user?.uid || ''))
  const classStudentIds = new Set(students.map((student) => student.id))
  const availableStudents = teacherStudents
    .filter((student) => !classStudentIds.has(student.id))
    .sort((a, b) => (`${a.firstName ?? ''} ${a.lastName ?? ''} ${a.email ?? ''}`)
      .localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''} ${b.email ?? ''}`, 'pl'))
  const lessonMaterialRows = visibleLessons.filter((lesson) => isMaterialLesson(lesson))
  const materialRows = [...visibleMaterials, ...lessonMaterialRows]
    .sort((a, b) => dateToUnix(b.timestamp || b.createdAt) - dateToUnix(a.timestamp || a.createdAt))
    .reduce((acc, row) => {
      if (acc.some((item) => item.id === row.id && item.sourceCollection === row.sourceCollection)) return acc
      acc.push(row)
      return acc
    }, [])
  const lessonRows = visibleLessons.filter((lesson) => !isMaterialLesson(lesson))
  const classSubjectText = classSubjectChoices.length > 0
    ? classSubjectChoices.map((subject) => subject.name).filter(Boolean).join(', ')
    : classSubjectLabel(cls, user?.uid)
  const selectedTeacherSuggestions = teacherSubjectSuggestions(subjectForm.teacherId)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost" onClick={() => navigate(buildPath('/teacher'))}>← Wróć</button>
          <Logo height={26} />
        </div>
      </header>

      <main className="app-main">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Klasa</p>
            <h1 className="page-title" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>{cls.name}</h1>
            <p className="page-subtitle">{classSubjectText} · {studentsLabel(students.length)} · {lessonRows.length} lekcji · {materialRows.length} materiałów</p>
          </div>
          <div className="hero-actions">
            <button className="btn btn-light" onClick={() => setShowLessonModal(true)}>+ Dodaj lekcję</button>
            <button className="btn btn-light" onClick={() => { setPdfUploadTarget('lesson'); setShowMaterialModal(true) }}>+ PDF jako lekcja</button>
            <button className="btn btn-light" onClick={() => { setPdfUploadTarget('material'); setShowMaterialModal(true) }}>+ PDF jako materiał</button>
            <button className="btn btn-light" onClick={() => setShowModal(true)}>+ Przypisz ucznia</button>
          </div>
        </section>

        {pageError && <div className="ui-card" style={{ padding: 14, color: '#dc2626', marginBottom: 12 }}>{pageError}</div>}
        {materialInfo && <div className="ui-card" style={s.successBox}>{materialInfo}</div>}

        <div style={s.tabWrap}>
          <button className={`btn ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleTabChange('students')}>
            Uczniowie
          </button>
          <button className={`btn ${activeTab === 'lessons' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleTabChange('lessons')}>
            Lekcje
          </button>
          <button className={`btn ${activeTab === 'materials' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => handleTabChange('materials')}>
            Materiały
          </button>
        </div>

        {activeTab === 'students' && (
          <section className="ui-card" style={{ padding: 18 }}>
            {canManageSubjects && (
              <div style={s.subjectPanel}>
                <h3 style={s.subjectTitle}>Przedmioty i nauczyciele klasy</h3>
                <p style={s.modalHint}>Jako wychowawca możesz przypisać nauczyciela do przedmiotu. Przypisany nauczyciel od razu zobaczy tę klasę i doda tam lekcje dla swojego przedmiotu.</p>
                <div style={s.subjectList}>
                  {classSubjects(cls).length === 0 ? (
                    <p style={s.hint}>Brak przypisanych przedmiotów.</p>
                  ) : (
                    classSubjects(cls).map((subject) => (
                      <div key={subject.id || subject.name} style={s.subjectRow}>
                        <div>
                          <div style={s.subjectName}>{subject.name}</div>
                          <div style={s.meta}>{teacherDisplayName(subject.teacherId)}</div>
                        </div>
                        <button
                          style={s.deleteBtn}
                          onClick={() => handleRemoveSubject(subject.id || '')}
                          disabled={subjectSaving}
                        >
                          Usuń
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div style={s.subjectForm}>
                  <input
                    type="text"
                    placeholder="Np. Matematyka"
                    value={subjectForm.name}
                    onChange={(e) => setSubjectForm((prev) => ({ ...prev, name: e.target.value }))}
                    style={s.input}
                    disabled={subjectSaving}
                  />
                  <select
                    value={subjectForm.teacherId}
                    onChange={(e) => {
                      const teacherId = e.target.value
                      const suggestions = teacherSubjectSuggestions(teacherId)
                      setSubjectForm((prev) => ({
                        ...prev,
                        teacherId,
                        name: prev.name || suggestions[0] || '',
                      }))
                    }}
                    style={s.input}
                    disabled={subjectSaving}
                  >
                    <option value="">Wybierz nauczyciela</option>
                    {envTeachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {`${teacher.firstName ?? ''} ${teacher.lastName ?? ''}`.trim() || teacher.email || 'Nauczyciel'}
                        {teacherSubjectSuggestions(teacher.id).length > 0
                          ? ` (${teacherSubjectSuggestions(teacher.id).join(', ')})`
                          : ''}
                        {teacher.email ? ` — ${teacher.email}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedTeacherSuggestions.length > 0 && (
                    <div style={s.subjectSuggestWrap}>
                      <span style={s.modalHint}>Sugerowane przedmioty:</span>
                      {selectedTeacherSuggestions.map((subjectName) => (
                        <button
                          key={subjectName}
                          type="button"
                          style={s.subjectSuggestBtn}
                          onClick={() => setSubjectForm((prev) => ({ ...prev, name: subjectName }))}
                          disabled={subjectSaving}
                        >
                          {subjectName}
                        </button>
                      ))}
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleAssignSubjectTeacher} disabled={subjectSaving}>
                    {subjectSaving ? 'Zapisywanie...' : 'Przypisz nauczyciela'}
                  </button>
                </div>
                {subjectError && <p style={s.error}>{subjectError}</p>}
              </div>
            )}

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
                    onClick={() => navigate(buildPath(`/teacher/student/${student.id}`))}
                  >
                    <div style={s.studentTop}>
                      <div style={s.avatar}>{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <button style={s.nameLink} onClick={() => navigate(buildPath(`/teacher/student/${student.id}`))}>
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
                <button className="btn btn-secondary" onClick={() => navigate(buildPath('/teacher/record'))}>Nagraj lekcję</button>
                <button className="btn btn-secondary" onClick={() => { setPdfUploadTarget('lesson'); setShowMaterialModal(true) }}>PDF jako lekcja</button>
                <button className="btn btn-primary" onClick={() => setShowLessonModal(true)}>Dodaj lekcję</button>
              </div>
            </div>
            {lessonsLoading ? (
              <p className="empty-state">Ładowanie lekcji...</p>
            ) : lessonRows.length === 0 ? (
              <IllustrationState
                type="noLessons"
                title="Brak lekcji w tej klasie"
                text="Dodaj lekcję ręcznie albo rozpocznij nagranie i przypisz materiał do tej klasy."
                action={(
                  <>
                    <button className="btn btn-secondary" onClick={() => navigate(buildPath('/teacher/record'))}>Nagraj lekcję</button>
                    <button className="btn btn-secondary" onClick={() => { setPdfUploadTarget('lesson'); setShowMaterialModal(true) }}>PDF jako lekcja</button>
                    <button className="btn btn-primary" onClick={() => setShowLessonModal(true)}>Dodaj lekcję</button>
                  </>
                )}
              />
            ) : (
              <div style={s.lessonList}>
                {lessonRows.map(lesson => {
                  const lessonNumber = lessonRows
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
                      onClick={() => navigate(buildPath(`/teacher/lesson/${lesson.id}`))}
                    >
                      <button style={s.lessonLink} onClick={(e) => { e.stopPropagation(); navigate(buildPath(`/teacher/lesson/${lesson.id}`)) }}>
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

        {activeTab === 'materials' && (
          <section className="ui-card" style={{ padding: 18 }}>
            <div style={s.lessonHeader}>
              <div>
                <h2 style={s.subTitle}>Materiały klasy</h2>
                <p style={s.meta}>PDF-y opracowane przez AI i widoczne dla uczniów w sekcji „Materiały”.</p>
              </div>
              <button className="btn btn-primary" onClick={() => { setPdfUploadTarget('material'); setShowMaterialModal(true) }}>PDF jako materiał</button>
            </div>
            {materialsLoading ? (
              <p className="empty-state">Ładowanie materiałów...</p>
            ) : materialRows.length === 0 ? (
              <IllustrationState
                type="noLessons"
                title="Brak materiałów w tej klasie"
                text="Wrzuć PDF, a AI przygotuje notatkę dla uczniów w osobnej kategorii Materiały."
                action={<button className="btn btn-primary" onClick={() => { setPdfUploadTarget('material'); setShowMaterialModal(true) }}>PDF jako materiał</button>}
              />
            ) : (
              <div style={s.lessonList}>
                {materialRows.map(material => {
                  const materialDate = resolveLessonDate(material)
                  const previewText = lessonPreview(material)
                  const isProcessing = material.processingStatus === 'processing' || material.status === 'processing'

                  return (
                    <article
                      key={material.id}
                      className="ui-card"
                      style={{ ...s.lessonCard, cursor: 'default' }}
                    >
                      <div style={s.materialTopRow}>
                        <span style={s.materialTitle}>
                          {material.title || 'Materiał PDF'}
                        </span>
                        <span style={isProcessing ? s.pendingMaterialBadge : s.readyMaterialBadge}>
                          {isProcessing ? 'AI przygotowuje' : 'Gotowe'}
                        </span>
                      </div>
                      {previewText && <p style={s.meta}>{previewText}</p>}
                      <p style={s.meta}>Data: {formatDateTime(materialDate)}</p>
                      {material.fileName && <p style={s.meta}>Plik: {material.fileName}</p>}
                      <div style={{ marginTop: 8 }}>
                        {confirmDeleteLessonId === material.id ? (
                          <span style={{ fontSize: 13 }}>
                            Usunąć materiał?{' '}
                            <button
                              style={s.dangerBtn}
                              onClick={(e) => { e.stopPropagation(); handleDeleteMaterial(material) }}
                              disabled={lessonDeleteLoadingId === material.id}
                            >
                              {lessonDeleteLoadingId === material.id ? 'Usuwanie...' : 'Tak'}
                            </button>{' '}
                            <button
                              style={s.cancelBtn}
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteLessonId('') }}
                              disabled={lessonDeleteLoadingId === material.id}
                            >
                              Nie
                            </button>
                          </span>
                        ) : (
                          <button
                            style={s.deleteBtn}
                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteLessonId(material.id) }}
                            disabled={lessonDeleteLoadingId === material.id}
                          >
                            Usuń materiał
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
            <select
              value={lessonForm.subject}
              onChange={e => setLessonForm(prev => ({ ...prev, subject: e.target.value }))}
              style={s.input}
            >
              {classSubjectChoices.length === 0 ? (
                <option value="">{classSubjectText}</option>
              ) : (
                classSubjectChoices.map((subject) => (
                  <option key={subject.id} value={subject.name}>{subject.name}</option>
                ))
              )}
            </select>
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
              <button style={s.cancelModalBtn} onClick={() => { setShowLessonModal(false); setLessonForm({ title: '', summary: '', subject: lessonForm.subject || '' }); setLessonError('') }}>
                Anuluj
              </button>
              <button style={s.primaryBtn} onClick={handleAddLesson} disabled={lessonLoading}>
                {lessonLoading ? 'Dodawanie...' : 'Dodaj lekcję'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal PDF */}
      {showMaterialModal && (
        <div style={s.overlay} onClick={() => !materialLoading && setShowMaterialModal(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>{pdfUploadTarget === 'lesson' ? 'PDF jako lekcja' : 'PDF jako materiał'}</h2>
            <p style={s.modalHint}>
              {pdfUploadTarget === 'lesson'
                ? 'AI przeanalizuje PDF i utworzy z niego lekcję dla klasy wraz z treścią do dalszego flow.'
                : 'AI przeanalizuje PDF i utworzy zwykły materiał dodatkowy dla uczniów, bez tworzenia lekcji.'}
            </p>
            <input
              type="text"
              placeholder={pdfUploadTarget === 'lesson' ? 'Tytuł lekcji (opcjonalnie)' : 'Tytuł materiału (opcjonalnie)'}
              value={materialForm.title}
              onChange={e => setMaterialForm(prev => ({ ...prev, title: e.target.value }))}
              style={s.input}
              disabled={materialLoading}
            />
            <select
              value={materialForm.subject}
              onChange={e => setMaterialForm(prev => ({ ...prev, subject: e.target.value }))}
              style={{ ...s.input, marginTop: 10 }}
              disabled={materialLoading}
            >
              {classSubjectChoices.length === 0 ? (
                <option value="">{classSubjectText}</option>
              ) : (
                classSubjectChoices.map((subject) => (
                  <option key={subject.id} value={subject.name}>{subject.name}</option>
                ))
              )}
            </select>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={e => setMaterialForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
              style={{ ...s.input, marginTop: 10 }}
              disabled={materialLoading}
            />
            {materialForm.file && <p style={s.modalHint}>Wybrano: {materialForm.file.name}</p>}
            {materialError && <p style={s.error}>{materialError}</p>}
            <div style={s.modalBtns}>
              <button style={s.cancelModalBtn} onClick={() => { setShowMaterialModal(false); setMaterialForm({ title: '', file: null, subject: materialForm.subject || '' }); setMaterialError('') }} disabled={materialLoading}>
                Anuluj
              </button>
              <button style={s.primaryBtn} onClick={handleUploadMaterial} disabled={materialLoading || !materialForm.file}>
                {materialLoading ? 'Wysyłanie do AI...' : (pdfUploadTarget === 'lesson' ? 'Utwórz lekcję z PDF' : 'Utwórz materiał z PDF')}
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
  subjectPanel: { marginBottom: 18, padding: 14, borderRadius: 14, border: '1px solid #dbe3f1', background: '#f8fafc' },
  subjectTitle: { margin: '0 0 10px', color: '#0f172a', fontSize: 17, fontWeight: 800 },
  subjectList: { display: 'grid', gap: 8, marginBottom: 12 },
  subjectRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff' },
  subjectName: { fontSize: 14, color: '#0f172a', fontWeight: 700 },
  subjectForm: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'stretch' },
  subjectSuggestWrap: { gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: -2 },
  subjectSuggestBtn: { border: '1px solid #bfdbfe', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 12, fontWeight: 700, padding: '4px 10px', cursor: 'pointer' },
  studentGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 },
  studentCard: { padding: 16, borderRadius: 18, border: '1px solid #dbe3f1', cursor: 'pointer', minWidth: 0 },
  studentTop: { display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 },
  avatar: { width: 46, height: 46, borderRadius: 14, display: 'grid', placeItems: 'center', flexShrink: 0, color: '#fff', background: 'linear-gradient(135deg, #2563eb, #14b8a6)', fontWeight: 800, fontSize: 15 },
  profileMetaGrid: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'center', padding: '10px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12 },
  profileMetaLabel: { fontSize: 12, color: '#64748b', fontWeight: 700 },
  profileMetaValue: { fontSize: 13, color: '#0f172a', fontWeight: 700, textAlign: 'right' },
  lessonHeader: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 },
  lessonList: { display: 'grid', gap: 10 },
  lessonCard: { padding: 14, borderRadius: 14, border: '1px solid #dbe3f1', cursor: 'pointer' },
  successBox: { padding: 14, color: '#166534', marginBottom: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' },
  lessonTitle: { fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 },
  lessonLink: { background: 'none', border: 'none', color: '#0f172a', cursor: 'pointer', fontSize: 16, fontWeight: 800, marginBottom: 6, padding: 0, textAlign: 'left' },
  materialTitle: { color: '#0f172a', fontSize: 16, fontWeight: 800, marginBottom: 6 },
  materialTopRow: { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  readyMaterialBadge: { flexShrink: 0, borderRadius: 999, padding: '5px 10px', background: '#dcfce7', color: '#166534', fontSize: 12, fontWeight: 800 },
  pendingMaterialBadge: { flexShrink: 0, borderRadius: 999, padding: '5px 10px', background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 800 },
  subTitle: { fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 },
  primaryBtn: { background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
  hint: { color: '#9ca3af', fontSize: 14 },
  codeBanner: { position: 'fixed', right: 16, bottom: 16, zIndex: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, width: 'min(560px, calc(100% - 32px))', padding: '16px 20px', background: '#dcfce7', border: '1px solid #86efac', borderRadius: 12, boxShadow: '0 14px 40px rgba(22, 163, 74, .2)' },
  codeBannerText: { fontSize: 14, color: '#14532d', lineHeight: 1.6 },
  codeDisplay: { display: 'inline-block', marginLeft: 10, padding: '4px 14px', background: '#fff', border: '2px solid #22c55e', borderRadius: 8, fontFamily: 'monospace', fontSize: 22, fontWeight: 700, letterSpacing: 6, color: '#15803d' },
  codeCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280', flexShrink: 0 },
  nameLink: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 15, fontWeight: 700, padding: 0, textAlign: 'left' },
  meta: { fontSize: 13, color: '#64748b', marginTop: 4, overflowWrap: 'anywhere', wordBreak: 'break-word' },
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
