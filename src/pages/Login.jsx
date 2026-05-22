import Logo from '../components/Logo'
import { useState, useEffect } from 'react'
import { ArrowRight, KeyRound, LogIn } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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

// Widok: 'login' | 'code' | 'setPassword'
export default function Login() {
  const [view, setView] = useState('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pwValue, setPwValue] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const navigate = useNavigate()

  // Przy każdym wejściu na /login sprawdź czy zalogowany uczeń nie skończył aktywacji.
  useEffect(() => {
    const checkIncompleteSetup = async () => {
      const currentUser = auth.currentUser
      if (!currentUser) return
      try {
        const studentSnap = await getDoc(doc(db, 'students', currentUser.uid))
        if (studentSnap.exists() && studentSnap.data().passwordSet === false) {
          setView('setPassword')
          return
        }
        // Użytkownik w pełni aktywny — przekieruj do właściwego panelu.
        const teacherSnap = await getDoc(doc(db, 'teachers', currentUser.uid))
        navigate(teacherSnap.exists() ? '/teacher' : '/student', { replace: true })
      } catch {
        // Nie blokuj strony logowania przy błędzie sprawdzania.
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
        navigate('/teacher')
        return
      }
      const studentDoc = await getDoc(doc(db, 'students', credential.user.uid))
      if (studentDoc.exists() && studentDoc.data().passwordSet === false) {
        setView('setPassword')
        return
      }
      navigate('/student')
    } catch (err) {
      setError(getErrorMessage(err.code))
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
      await setDoc(doc(db, 'teachers', credential.user.uid), {
        firstName,
        lastName,
        email,
        createdAt: serverTimestamp(),
      })
      navigate('/teacher')
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

      const invitationDoc = snapshot.docs.find((d) => String(d.data()?.code ?? '').trim() === normalizedCode)

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

        await setDoc(doc(db, 'students', credential.user.uid), {
          email: normalizedEmail,
          firstName: invitation.firstName ?? '',
          lastName: invitation.lastName ?? '',
          teacherId: invitation.teacherId ?? '',
          classId: invitation.classId,
          classIds: invitation.classId ? [invitation.classId] : [],
          joinedAt: serverTimestamp(),
          passwordSet: false,
        }, { merge: true })
        await setDoc(doc(db, 'student_profiles', credential.user.uid), {
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
        setView('setPassword')
      } else if (invitation.status === 'used') {
        // Konto aktywowane — sprawdź czy uczeń zdążył już zmienić hasło.
        // Jeśli nie (hasłem nadal jest kod), pozwól dokończyć ustawianie hasła.
        try {
          const credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedCode)
          await setDoc(doc(db, 'students', credential.user.uid), { passwordSet: false }, { merge: true })
          // Zalogowanie kodem powiodło się — hasło nie zostało jeszcze zmienione.
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
    if (pwValue.length < 6) { setError('Hasło musi mieć co najmniej 6 znaków.'); return }
    if (pwValue !== pwConfirm) { setError('Hasła nie są identyczne.'); return }
    setError('')
    setLoading(true)
    try {
      await updatePassword(auth.currentUser, pwValue)
      // Oznacz że hasło zostało już ustawione — zabezpieczenie przed ponownym trafieniem na setPassword.
      try {
        await setDoc(doc(db, 'students', auth.currentUser.uid), { passwordSet: true }, { merge: true })
      } catch {
        // Nie blokuj nawigacji jeśli zapis się nie udał.
      }
      navigate('/student')
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
            <h1>Notatki, zadania i feedback w jednym miejscu.</h1>
            <p>EduFlow zamienia nagraną lekcję w ścieżkę pracy ucznia, a nauczycielowi pokazuje postępy bez przekopywania się przez chaos.</p>
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
      return 'Nieprawidłowy email lub hasło.'
    case 'auth/email-already-in-use':
      return 'Ten email jest już zajęty.'
    case 'auth/weak-password':
      return 'Hasło jest za słabe (min. 6 znaków).'
    case 'auth/too-many-requests':
      return 'Za dużo prób. Spróbuj za chwilę.'
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
