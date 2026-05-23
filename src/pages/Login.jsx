import Logo from '../components/Logo'
import { useState, useEffect } from 'react'
import { ArrowRight, KeyRound, LogIn } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc,
  query,
  collection,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore'
import { auth, db } from '../firebase'
import { useEnvironment } from '../contexts/EnvironmentContext'

function markPasswordSetupPending(uid) {
  try {
    window.localStorage.setItem(`eduflow-password-setup:${uid}`, 'pending')
  } catch {
    // no-op
  }
}

function clearPasswordSetupPending(uid) {
  try {
    window.localStorage.removeItem(`eduflow-password-setup:${uid}`)
  } catch {
    // no-op
  }
}

function hasPendingPasswordSetup(uid) {
  try {
    return window.localStorage.getItem(`eduflow-password-setup:${uid}`) === 'pending'
  } catch {
    return false
  }
}

// Widok: 'login' | 'code' | 'setPassword'
export default function Login() {
  const { environment, environmentId, isDefaultEnvironment, buildPath } = useEnvironment()
  const [view, setView] = useState('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const navigate = useNavigate()

  const resolveEnvironmentPath = async (profileEnvironmentId, path) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`
    const targetEnvironmentId = profileEnvironmentId || 'default'
    if (targetEnvironmentId === 'default') return normalizedPath
    if (!isDefaultEnvironment && targetEnvironmentId === environmentId) return buildPath(normalizedPath)
    try {
      const envSnap = await getDoc(doc(db, 'environments', targetEnvironmentId))
      const slug = envSnap.exists() ? envSnap.data()?.slug : ''
      if (slug) return `/e/${slug}${normalizedPath}`
    } catch {
      // Use the current route if the environment lookup fails.
    }
    return buildPath(normalizedPath)
  }

  // Przy każdym wejściu na /login sprawdź czy zalogowany uczeń nie skończył aktywacji.
  useEffect(() => {
    const checkIncompleteSetup = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) return
      try {
        const teacherSnap = await getDoc(doc(db, 'teachers', currentUser.uid))
        if (teacherSnap.exists()) {
          const teacherEnvironmentId = teacherSnap.data()?.environmentId || 'default'
          if (!isDefaultEnvironment && teacherEnvironmentId !== environmentId) {
            setError('Nie masz dostępu do tego środowiska.')
            await signOut(auth)
            return
          }
          navigate(await resolveEnvironmentPath(teacherEnvironmentId, '/teacher'), { replace: true })
          return
        }

        const studentSnap = await getDoc(doc(db, 'students', currentUser.uid))
        if (!studentSnap.exists()) {
          setError('Konto ucznia nie jest jeszcze aktywne. Zaloguj się kodem zaproszenia lub skontaktuj się z nauczycielem.')
          await signOut(auth)
          return
        }

        const studentData = studentSnap.data()
        const studentEnvironmentId = studentData?.environmentId || 'default'
        if (!isDefaultEnvironment && studentEnvironmentId !== environmentId) {
          setError('Nie masz dostępu do tego środowiska.')
          await signOut(auth)
          return
        }
        if (studentData?.passwordSet === false && hasPendingPasswordSetup(currentUser.uid)) {
          setView('setPassword')
          return
        }

        navigate(await resolveEnvironmentPath(studentEnvironmentId, '/student'), { replace: true })
      } catch {
        setError('Nie udało się sprawdzić statusu konta. Odśwież stronę i spróbuj ponownie.')
      }
    }
    checkIncompleteSetup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { register, handleSubmit, reset, formState: { errors } } = useForm()

  const switchView = (v) => { if (v === 'register') return; setView(v); setError(''); reset() }

  // --- LOGOWANIE email + hasło (nauczyciel lub uczeń z kontem) ---
  const handleLogin = async ({ email, password }) => {
    setError('')
    setLoading(true)
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const teacherDoc = await getDoc(doc(db, 'teachers', credential.user.uid))
      if (teacherDoc.exists()) {
        const teacherEnvironmentId = teacherDoc.data()?.environmentId || 'default'
        if (!isDefaultEnvironment && teacherEnvironmentId !== environmentId) {
          setError('Nie masz dostępu do tego środowiska.')
          await signOut(auth)
          return
        }
        navigate(await resolveEnvironmentPath(teacherEnvironmentId, '/teacher'))
        return
      }
      const studentDoc = await getDoc(doc(db, 'students', credential.user.uid))
      if (!studentDoc.exists()) {
        setError('Konto ucznia nie jest jeszcze aktywne. Użyj kodu zaproszenia przy pierwszym logowaniu.')
        await signOut(auth)
        return
      }
      const studentData = studentDoc.data()
      const studentEnvironmentId = studentData?.environmentId || 'default'
      if (!isDefaultEnvironment && studentEnvironmentId !== environmentId) {
        setError('Nie masz dostępu do tego środowiska.')
        await signOut(auth)
        return
      }
      if (studentData.passwordSet === false && hasPendingPasswordSetup(credential.user.uid)) {
        setView('setPassword')
        return
      }
      navigate(await resolveEnvironmentPath(studentEnvironmentId, '/student'))
    } catch (err) {
      setError(err?.code ? getErrorMessage(err.code) : 'Logowanie nie powiodło się. Spróbuj ponownie.')
    } finally {
      setLoading(false)
    }
  }

  // --- REJESTRACJA nauczyciela ---
  const handleRegister = async ({ email, password, firstName, lastName }) => {
    setError('')
    setLoading(true)
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password)
      const teacherPayload = {
        firstName,
        lastName,
        email,
        environmentId,
        role: 'teacher',
        createdAt: serverTimestamp(),
      }
      await Promise.all([
        setDoc(doc(db, 'teachers', credential.user.uid), teacherPayload),
        setDoc(doc(db, 'users', credential.user.uid), { ...teacherPayload, updatedAt: serverTimestamp() }, { merge: true }),
      ])
      navigate(buildPath('/teacher'))
    } catch (err) {
      setError(getErrorMessage(err.code))
    } finally {
      setLoading(false)
    }
  }

  // --- PIERWSZE LOGOWANIE ucznia kodem ---
  const handleCode = async ({ email, code }) => {
    setError('')
    setLoading(true)
    try {
      const normalizedEmail = String(email || '').trim().toLowerCase()
      const normalizedCode = String(code || '').trim()

      const q = query(
        collection(db, 'invitations'),
        where('email', '==', normalizedEmail)
      )
      const snapshot = await getDocs(q)

      const invitationDoc = snapshot.docs.find((d) => {
        const data = d.data()
        const invitationEnvironmentId = data?.environmentId || 'default'
        const codeMatches = String(data?.code ?? '').trim() === normalizedCode
        const environmentMatches = isDefaultEnvironment ? invitationEnvironmentId === 'default' : invitationEnvironmentId === environmentId
        return codeMatches && environmentMatches
      })

      if (!invitationDoc) {
        setError('Nieprawidłowy email lub kod. Sprawdź wiadomość od nauczyciela.')
        return
      }

      const invitation = invitationDoc.data()

      if (invitation.status === 'pending') {
        let credential
        try {
          credential = await createUserWithEmailAndPassword(auth, normalizedEmail, normalizedCode)
        } catch (err) {
          // Jeśli konto już istnieje, pozwól wejść kodem tylko gdy hasłem nadal jest kod zaproszenia.
          if (err.code === 'auth/email-already-in-use') {
            try {
              credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedCode)
            } catch {
              setError('To konto jest już aktywne. Zaloguj się swoim własnym hasłem.')
              return
            }
          } else {
            throw err
          }
        }

        const studentPayload = {
          email: normalizedEmail,
          firstName: invitation.firstName ?? '',
          lastName: invitation.lastName ?? '',
          role: 'student',
          teacherId: invitation.teacherId ?? '',
          classId: invitation.classId,
          classIds: invitation.classId ? [invitation.classId] : [],
          environmentId: invitation.environmentId || 'default',
          joinedAt: serverTimestamp(),
          passwordSet: false,
        }
        await setDoc(doc(db, 'students', credential.user.uid), studentPayload, { merge: true })
        await setDoc(doc(db, 'users', credential.user.uid), { ...studentPayload, updatedAt: serverTimestamp() }, { merge: true })
        await setDoc(doc(db, 'student_profiles', credential.user.uid), {
          environmentId: invitation.environmentId || 'default',
          weaknesses: [],
          errorHistory: [],
          aiRecommendation: '',
        }, { merge: true })

        // Dodaj ucznia do listy studentów w klasie (jeśli klasa istnieje).
        if (invitation.classId) {
          try {
            await updateDoc(doc(db, 'classes', invitation.classId), {
              studentIds: arrayUnion(credential.user.uid),
            })
          } catch {
            // Nie blokuj aktywacji konta, jeśli klasa została usunięta lub zmieniona.
          }
        }

        await updateDoc(doc(db, 'invitations', invitationDoc.id), {
          status: 'used',
          studentId: credential.user.uid,
          usedAt: serverTimestamp(),
        })
        // Przejdź do ustawienia własnego hasła
        markPasswordSetupPending(credential.user.uid)
        setView('setPassword')
      } else if (invitation.status === 'used') {
        // Konto aktywowane — sprawdź czy uczeń zdążył już zmienić hasło.
        // Jeśli nie (hasłem nadal jest kod), pozwól dokończyć ustawianie hasła.
        try {
          const credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedCode)
          await setDoc(doc(db, 'students', credential.user.uid), { passwordSet: false }, { merge: true })
          // Zalogowanie kodem powiodło się — hasło nie zostało jeszcze zmienione.
          markPasswordSetupPending(credential.user.uid)
          setView('setPassword')
        } catch {
          // Kod już nie działa jako hasło — uczeń ma własne hasło.
          setError('To konto jest już aktywne. Zaloguj się swoim własnym hasłem.')
        }
        return
      } else {
        setError('Zaproszenie wygasło lub jest nieprawidłowe.')
      }
    } catch (err) {
      setError(getErrorMessage(err.code))
    } finally {
      setLoading(false)
    }
  }

  const handleSetPassword = async (e) => {
    e.preventDefault()
    if (!auth.currentUser) { setError('Sesja wygasła. Zaloguj się ponownie.'); return }
    if (pwValue.length < 6) { setError('Hasło musi mieć co najmniej 6 znaków.'); return }
    if (pwValue !== pwConfirm) { setError('Hasła nie są identyczne.'); return }
    setError('')
    setLoading(true)
    try {
      const currentUser = auth.currentUser
      await updatePassword(currentUser, pwValue)
      await setDoc(doc(db, 'students', currentUser.uid), { passwordSet: true }, { merge: true })
      clearPasswordSetupPending(currentUser.uid)
      const studentSnap = await getDoc(doc(db, 'students', currentUser.uid))
      const studentEnvironmentId = studentSnap.exists() ? (studentSnap.data()?.environmentId || 'default') : environmentId
      navigate(await resolveEnvironmentPath(studentEnvironmentId, '/student'))
    } catch (err) {
      setError(getErrorMessage(err.code))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <section className="auth-brand">
          <Logo height={34} style={{ filter: 'brightness(0) invert(1)' }} />
          <div className="auth-copy">
            <p className="eyebrow">Inteligentna nauka po lekcji</p>
            <h1>{environment?.name && environment.slug !== 'default' ? environment.name : 'Notatki, zadania i feedback w jednym miejscu.'}</h1>
            <p>{environment?.name && environment.slug !== 'default' ? 'Twoje osobne środowisko EduFlow dla uczniów, nauczycieli i materiałów.' : 'EduFlow zamienia nagraną lekcję w ścieżkę pracy ucznia, a nauczycielowi pokazuje postępy bez przekopywania się przez chaos.'}</p>
          </div>
        </section>

        <section className="auth-form-panel">

      {view === 'login' && (
        <>
          <h2 className="auth-heading">Zaloguj się</h2>
          <p className="auth-hint">Wróć do swoich klas, lekcji i zadań.</p>
          <form onSubmit={handleSubmit(handleLogin)} className="form-stack">
            <input
              type="email"
              placeholder="Email"
              className="ui-input"
              {...register('email', { required: 'Podaj email' })}
            />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
            <input
              type="password"
              placeholder="Hasło"
              className="ui-input"
              {...register('password', { required: 'Podaj hasło' })}
            />
            {errors.password && <span className="field-error">{errors.password.message}</span>}
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <LogIn size={17} />
              {loading ? 'Logowanie...' : 'Zaloguj się'}
            </button>
          </form>
          <div style={{ marginTop: 18 }}>
            <button className="link-button auth-invite-link" onClick={() => switchView('code')}>
              Masz kod zaproszenia od nauczyciela? Wejdź tutaj
              <ArrowRight size={15} style={{ marginLeft: 6, verticalAlign: -2 }} />
            </button>
          </div>
        </>
      )}

      {view === 'code' && (
        <>
          <h2 className="auth-heading">Wpisz kod zaproszenia</h2>
          <p className="auth-hint">Kod znajdziesz w wiadomości email od nauczyciela.</p>
          <form onSubmit={handleSubmit(handleCode)} className="form-stack">
            <input
              type="email"
              placeholder="Twój email"
              className="ui-input"
              {...register('email', { required: 'Podaj email' })}
            />
            {errors.email && <span className="field-error">{errors.email.message}</span>}
            <input
              placeholder="6-cyfrowy kod"
              maxLength={6}
              inputMode="numeric"
              className="ui-input"
              style={{ letterSpacing: 8, textAlign: 'center', fontSize: 22 }}
              {...register('code', {
                required: 'Podaj kod',
                pattern: { value: /^\d{6}$/, message: 'Kod musi mieć dokładnie 6 cyfr' },
              })}
            />
            {errors.code && <span className="field-error">{errors.code.message}</span>}
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <KeyRound size={17} />
              {loading ? 'Sprawdzanie...' : 'Wejdź do panelu'}
            </button>
          </form>
          <button className="link-button" style={{ marginTop: 18 }} onClick={() => switchView('login')}>Wróć do logowania</button>
        </>
      )}

      {view === 'setPassword' && (
        <>
          <h2 className="auth-heading">Ustaw swoje hasło</h2>
          <p className="auth-hint">Wybierz własne hasło, którego będziesz używać przy każdym kolejnym logowaniu.</p>
          <form onSubmit={handleSetPassword} className="form-stack">
            <input
              type="password"
              placeholder="Nowe hasło (min. 6 znaków)"
              className="ui-input"
              value={pwValue}
              onChange={e => setPwValue(e.target.value)}
            />
            <input
              type="password"
              placeholder="Powtórz hasło"
              className="ui-input"
              value={pwConfirm}
              onChange={e => setPwConfirm(e.target.value)}
            />
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <KeyRound size={17} />
              {loading ? 'Zapisywanie...' : 'Ustaw hasło i wejdź'}
            </button>
          </form>
        </>
      )}
        </section>
      </div>
    </div>
  )
}

function getErrorMessage(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/too-many-requests':
      return 'Nieprawidłowy email lub hasło.'
    case 'auth/email-already-in-use':
      return 'Ten email jest już zajęty.'
    case 'auth/weak-password':
      return 'Hasło jest za słabe (min. 6 znaków).'
    default:
      return 'Wystąpił błąd. Spróbuj ponownie.'
  }
}

const styles = {
  container: { maxWidth: 400, margin: '80px auto', padding: '0 20px', fontFamily: 'sans-serif', textAlign: 'center' },
  logo: { fontSize: 36, fontWeight: 700, color: '#2563eb', marginBottom: 24 },
  heading: { fontSize: 20, fontWeight: 600, marginBottom: 16, color: '#111827' },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { padding: '12px 14px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' },
  btn: { padding: '12px', fontSize: 15, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 4 },
  error: { color: '#dc2626', fontSize: 14, margin: '4px 0' },
  fieldError: { color: '#dc2626', fontSize: 13, textAlign: 'left' },
  hint: { color: '#6b7280', fontSize: 14, marginBottom: 12 },
  linksCol: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 },
  link: { background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: 13, padding: 4 },
}
