import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'
import Logo from '../components/Logo'

const AuthContext = createContext(null)

function hasPendingPasswordSetup(uid) {
  try {
    return window.localStorage.getItem(`eduflow-password-setup:${uid}`) === 'pending'
  } catch {
    return false
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [teacherProfile, setTeacherProfile] = useState(null)
  const [studentProfile, setStudentProfile] = useState(null)
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser)
          const teacherDoc = await getDoc(doc(db, 'teachers', firebaseUser.uid))
          if (teacherDoc.exists()) {
            setRole('teacher')
            setTeacherProfile(teacherDoc.data())
            setStudentProfile(null)
            setPasswordSetupRequired(false)
            return
          }

          const studentDoc = await getDoc(doc(db, 'students', firebaseUser.uid))
          const studentData = studentDoc.exists() ? studentDoc.data() : null

          setRole('student')
          setTeacherProfile(null)
          setStudentProfile(studentData)
          setPasswordSetupRequired(studentData?.passwordSet === false && hasPendingPasswordSetup(firebaseUser.uid))
          return
        }

        setUser(null)
        setRole(null)
        setTeacherProfile(null)
        setStudentProfile(null)
        setPasswordSetupRequired(false)
      } catch {
        // Firestore chwilowo niedostepny (np. opóźnienie sieci przy hard refresh).
        // NIE czyść user — sesja Firebase Auth musi przetrwać.
        // Jeśli firebaseUser nie istnieje, wtedy zeruj wszystko.
        if (!firebaseUser) {
          setUser(null)
          setRole(null)
          setTeacherProfile(null)
          setStudentProfile(null)
          setPasswordSetupRequired(false)
        }
        // Gdy firebaseUser istnieje: user pozostaje ustawiony, role = null.
        // PrivateRoute obsłuży to bez przekierowania do /login.
      } finally {
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, teacherProfile, studentProfile, passwordSetupRequired, loading }}>
      {loading ? <AuthBootScreen /> : children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

function AuthBootScreen() {
  return (
    <div style={s.bootPage}>
      <div style={s.bootCard}>
        <Logo height={30} />
        <p style={s.bootTitle}>Ładowanie sesji</p>
        <p style={s.bootText}>Jeszcze chwila...</p>
        <div style={s.loaderTrack}>
          <span style={s.loaderBar} />
        </div>
      </div>
      <style>{`@keyframes loaderSlide { 0% { transform: translateX(-120%); } 100% { transform: translateX(240%); } }`}</style>
    </div>
  )
}

const s = {
  bootPage: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    background: '#f8fafc',
    padding: 20,
  },
  bootCard: {
    width: 'min(360px, 100%)',
    border: '1px solid #e2e8f0',
    background: '#ffffff',
    borderRadius: 14,
    padding: '24px 22px',
    display: 'grid',
    gap: 8,
  },
  bootTitle: {
    margin: '8px 0 0',
    color: '#0f172a',
    fontSize: 18,
    fontWeight: 700,
  },
  bootText: {
    margin: 0,
    color: '#64748b',
    fontSize: 13,
  },
  loaderTrack: {
    marginTop: 8,
    width: '100%',
    height: 4,
    background: '#e2e8f0',
    borderRadius: 999,
    overflow: 'hidden',
  },
  loaderBar: {
    display: 'block',
    width: '42%',
    height: '100%',
    borderRadius: 999,
    background: '#2563eb',
    animation: 'loaderSlide 1s ease-in-out infinite',
  },
}
