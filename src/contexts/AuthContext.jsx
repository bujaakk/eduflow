import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '../firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [teacherProfile, setTeacherProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser)
        const teacherDoc = await getDoc(doc(db, 'teachers', firebaseUser.uid))
        if (teacherDoc.exists()) {
          setRole('teacher')
          setTeacherProfile(teacherDoc.data())
        } else {
          setRole('student')
          setTeacherProfile(null)
        }
      } else {
        setUser(null)
        setRole(null)
        setTeacherProfile(null)
      }
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{ user, role, teacherProfile, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
