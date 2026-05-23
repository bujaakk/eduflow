export const classSubjects = (cls) => {
  if (Array.isArray(cls?.subjects) && cls.subjects.length > 0) return cls.subjects
  if (cls?.subject) {
    return [{ id: 'legacy', name: cls.subject, teacherId: cls.teacherId || '' }]
  }
  return []
}

export const classBelongsToTeacher = (cls, teacherId, isEnvironmentAdmin = false) => {
  if (!cls || !teacherId) return false
  if (isEnvironmentAdmin) return true
  if (cls.teacherId === teacherId || cls.homeroomTeacherId === teacherId) return true
  return classSubjects(cls).some((subject) => subject.teacherId === teacherId)
}

export const classSubjectLabel = (cls, teacherId = '') => {
  const subjects = classSubjects(cls)
  if (subjects.length > 0) {
    return subjects.map((subject) => subject.name).filter(Boolean).join(', ')
  }
  if (cls?.subject) return cls.subject
  if (teacherId && cls?.homeroomTeacherId === teacherId) return 'Wychowawca'
  return 'brak przedmiotow'
}

export const normalizeSubjectKey = (value) => String(value || '').trim().toLowerCase()

export const classSubjectOptions = (cls, teacherId = '', isEnvironmentAdmin = false) => {
  const subjects = classSubjects(cls)
    .map((subject, index) => ({
      id: subject?.id || `${index}`,
      name: String(subject?.name || '').trim(),
      teacherId: String(subject?.teacherId || '').trim(),
    }))
    .filter((subject) => subject.name)

  if (subjects.length === 0) {
    const fallback = classSubjectLabel(cls, teacherId)
    return fallback && fallback !== 'brak przedmiotow'
      ? [{ id: 'fallback', name: fallback, teacherId: String(cls?.teacherId || cls?.homeroomTeacherId || '').trim() }]
      : []
  }

  if (isEnvironmentAdmin) return subjects

  const teacherSubjects = subjects.filter((subject) => subject.teacherId && subject.teacherId === teacherId)
  if (teacherSubjects.length > 0) return teacherSubjects

  if (cls?.homeroomTeacherId === teacherId) {
    return subjects
  }

  return []
}