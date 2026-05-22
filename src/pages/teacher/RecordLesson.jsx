import Logo from '../../components/Logo'
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import { useAuth } from '../../contexts/AuthContext'
import IllustrationState from '../../components/IllustrationState'
import { uploadLesson } from '../../services/lessonUpload'

const MAX_SECONDS = 180 // 3 minuty

const PROMPTS = [
  'Jaki był główny temat dzisiejszej lekcji?',
  'Jakie daty / nazwiska / pojęcia były kluczowe?',
  'Co sprawiało uczniom najwięcej trudności?',
  'Co chcesz żeby uczniowie zapamiętali na pewno?',
]

const REQUEST_TIMEOUT_MS = 45000

const getUploadErrorMessage = (error, fallback) => {
  if (!error) return fallback
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return fallback
}

const extractTranscript = (payload) => {
  if (!payload) return ''
  if (typeof payload === 'string') return payload.trim()
  if (Array.isArray(payload)) {
    return payload.map((item) => extractTranscript(item)).filter(Boolean).join('\n').trim()
  }
  if (typeof payload === 'object') {
    const direct = payload.transcript || payload.text || payload.result || payload.output
    if (typeof direct === 'string' && direct.trim()) return direct.trim()

    if (Array.isArray(direct) || typeof direct === 'object') {
      const nestedDirect = extractTranscript(direct)
      if (nestedDirect) return nestedDirect
    }

    const nested = payload.data || payload.response || payload.body
    const nestedText = extractTranscript(nested)
    if (nestedText) return nestedText
  }
  return ''
}

export default function RecordLesson() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [state, setState] = useState('idle') // idle | recording | sending | done | error
  const [seconds, setSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [mobileSession, setMobileSession] = useState(null) // { id, url, status, error }
  const [mobileLoading, setMobileLoading] = useState(false)
  const [reviewAudioUrl, setReviewAudioUrl] = useState('')
  const [reviewAudioPath, setReviewAudioPath] = useState('')
  const [reviewAudioBlob, setReviewAudioBlob] = useState(null)
  const [reviewSource, setReviewSource] = useState('desktop')
  const [transcript, setTranscript] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [autoTranscriptAttempted, setAutoTranscriptAttempted] = useState(false)
  const [transcriptionError, setTranscriptionError] = useState('')
  const [transcriptionInfo, setTranscriptionInfo] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [successMessage, setSuccessMessage] = useState('AI przetwarza nagranie i generuje zadania dla uczniów.')

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const mobileUnsubRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const fetchClasses = async () => {
      const snap = await getDocs(query(collection(db, 'classes'), where('teacherId', '==', user.uid)))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setClasses(list)
      if (list.length > 0) setSelectedClass(list[0].id)
    }
    fetchClasses()
  }, [user])

  const selectedClassMeta = classes.find((cls) => cls.id === selectedClass) || null

  useEffect(() => {
    return () => {
      if (mobileUnsubRef.current) mobileUnsubRef.current()
    }
  }, [])

  // Auto-stop po 3 minutach
  useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => {
        setSeconds(s => {
          if (s + 1 >= MAX_SECONDS) {
            handleStop()
            return MAX_SECONDS
          }
          return s + 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [state])

  const handleStart = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = e => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setReviewAudioBlob(blob)
        setReviewAudioUrl(URL.createObjectURL(blob))
        setReviewAudioPath('')
        setReviewSource('desktop')
        setTranscript('')
        setTranscriptionError('')
        setTranscriptionInfo('')
        setAutoTranscriptAttempted(false)
        stream.getTracks().forEach(t => t.stop())
      }

      recorder.start()
      setSeconds(0)
      setState('recording')
    } catch {
      alert('Brak dostępu do mikrofonu. Zezwól na dostęp w przeglądarce.')
    }
  }

  const handleStop = () => {
    clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setState('idle')
  }

  const resolveReviewBlob = async () => {
    if (reviewAudioBlob) return reviewAudioBlob
    if (reviewSource === 'mobile_qr') return null
    if (!reviewAudioUrl) return null
    const response = await fetch(reviewAudioUrl)
    const blob = await response.blob()
    setReviewAudioBlob(blob)
    return blob
  }

  const handleGenerateTranscript = async () => {
    setTranscriptionError('')
    setTranscriptionInfo('')
    setIsTranscribing(true)
    try {
      const blob = await resolveReviewBlob()
      if ((!blob && !reviewAudioUrl) || !selectedClass) return

      const responsePayload = await uploadLesson(blob, selectedClass, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        remoteAudioUrl: reviewSource === 'mobile_qr' ? reviewAudioUrl : '',
        remoteStoragePath: reviewSource === 'mobile_qr' ? reviewAudioPath : '',
        extraFields: {
          mode: 'transcribe',
          workflowStep: 'transcribe_only',
          waitForApproval: 'true',
          executeAutomation: 'false',
          source: reviewSource,
          className: selectedClassMeta?.name ?? '',
          classSubject: selectedClassMeta?.subject ?? '',
        },
      })

      if (responsePayload && typeof responsePayload === 'object' && typeof responsePayload.message === 'string' && responsePayload.message.trim()) {
        setTranscriptionInfo(responsePayload.message)
      }

      const nextTranscript = extractTranscript(responsePayload)
      if (!nextTranscript) throw new Error('empty_transcript')
      setTranscript(nextTranscript)
    } catch (err) {
      if (err?.message === 'empty_transcript') {
        setTranscriptionError('Webhook nie zwrócił treści transkrypcji. Sprawdź workflow STT w n8n.')
      } else {
        setTranscriptionError(getUploadErrorMessage(err, 'Nie udało się pobrać transkrypcji.'))
      }
    } finally {
      setIsTranscribing(false)
      setAutoTranscriptAttempted(true)
    }
  }

  useEffect(() => {
    if (!reviewAudioUrl || !selectedClass || autoTranscriptAttempted || isTranscribing) return
    if (transcript.trim()) return
    handleGenerateTranscript()
  }, [reviewAudioUrl, selectedClass, autoTranscriptAttempted, isTranscribing, transcript])

  const handleApproveAndSend = async () => {
    setUploadError('')
    setState('sending')
    setIsApproving(true)

    try {
      const blob = await resolveReviewBlob()
      if ((!blob && !reviewAudioUrl) || !selectedClass) {
        setState('idle')
        return
      }
      if (!transcript.trim()) {
        alert('Najpierw dodaj transkrypcję (auto lub ręcznie), a potem zatwierdź.')
        setState('idle')
        return
      }

      const responsePayload = await uploadLesson(blob, selectedClass, {
        timeoutMs: REQUEST_TIMEOUT_MS,
        remoteAudioUrl: reviewSource === 'mobile_qr' ? reviewAudioUrl : '',
        remoteStoragePath: reviewSource === 'mobile_qr' ? reviewAudioPath : '',
        extraFields: {
          transcript,
          approvedByTeacher: 'true',
          source: reviewSource,
          mode: 'process',
          workflowStep: 'approve_and_process',
          waitForApproval: 'false',
          executeAutomation: 'true',
          className: selectedClassMeta?.name ?? '',
          classSubject: selectedClassMeta?.subject ?? '',
        },
      })
      if (responsePayload && typeof responsePayload === 'object' && typeof responsePayload.message === 'string' && responsePayload.message.trim()) {
        setSuccessMessage(responsePayload.message)
      } else {
        setSuccessMessage('AI przetwarza nagranie i generuje zadania dla uczniów.')
      }

      if (mobileSession?.id) {
        await updateDoc(doc(db, 'recordingSessions', mobileSession.id), {
          status: 'done',
          approvedAt: serverTimestamp(),
        })
      }
      setState('done')
    } catch (err) {
      setUploadError(getUploadErrorMessage(err, 'Wysyłka nie powiodła się. Spróbuj ponownie.'))
      setState('error')
    } finally {
      setIsApproving(false)
    }
  }

  const startMobileListener = (sessionId, url) => {
    if (mobileUnsubRef.current) mobileUnsubRef.current()

    mobileUnsubRef.current = onSnapshot(doc(db, 'recordingSessions', sessionId), (snap) => {
      if (!snap.exists()) {
        setMobileSession({ id: sessionId, url, status: 'error', error: 'Sesja została usunięta.' })
        return
      }
      const data = snap.data()
      if (data.status === 'uploaded' && data.audioUrl) {
        setReviewAudioUrl(data.audioUrl)
        setReviewAudioPath(data.storagePath ?? '')
        setReviewAudioBlob(null)
        setReviewSource('mobile_qr')
        setTranscript('')
        setTranscriptionError('')
        setTranscriptionInfo('')
        setAutoTranscriptAttempted(false)
      }
      setMobileSession({
        id: sessionId,
        url,
        status: data.status ?? 'waiting',
        error: data.error ?? '',
      })
    })
  }

  const handleCreateMobileSession = async () => {
    if (!user?.uid || !selectedClass) return
    setMobileLoading(true)
    try {
      const sessionRef = await addDoc(collection(db, 'recordingSessions'), {
        teacherId: user.uid,
        classId: selectedClass,
        status: 'waiting',
        createdAt: serverTimestamp(),
      })
      const url = `${window.location.origin}/teacher/record/mobile?session=${sessionRef.id}`
      setMobileSession({ id: sessionRef.id, url, status: 'waiting', error: '' })
      setReviewAudioUrl('')
      setReviewAudioPath('')
      setReviewAudioBlob(null)
      setTranscript('')
      setTranscriptionError('')
      setTranscriptionInfo('')
      setUploadError('')
      setAutoTranscriptAttempted(false)
      startMobileListener(sessionRef.id, url)
    } catch {
      setMobileSession({ id: '', url: '', status: 'error', error: 'Nie udało się utworzyć sesji mobilnej.' })
    } finally {
      setMobileLoading(false)
    }
  }

  const handleCloseMobileSession = async () => {
    if (!mobileSession?.id) return
    try {
      await updateDoc(doc(db, 'recordingSessions', mobileSession.id), {
        status: 'closed',
        closedAt: serverTimestamp(),
      })
    } catch {
      // no-op
    }
    if (mobileUnsubRef.current) mobileUnsubRef.current()
    mobileUnsubRef.current = null
    setMobileSession(null)
    setReviewAudioUrl('')
    setReviewAudioPath('')
    setReviewAudioBlob(null)
    setTranscript('')
    setTranscriptionError('')
    setTranscriptionInfo('')
    setUploadError('')
    setAutoTranscriptAttempted(false)
  }

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const timeLeft = MAX_SECONDS - seconds
  const isOverWarning = seconds >= 150 // ostatnie 30s

  return (
    <div style={s.page}>
      <header style={s.header}>
        <button style={s.backBtn} onClick={() => navigate('/teacher')}>← Wróć</button>
        <Logo height={26} />
      </header>

      <main style={s.main}>
        <h1 style={s.title}>Nagraj lekcję</h1>

        <div className="ui-card" style={s.recordingIntro}>
          <IllustrationState
            type="voiceRecording"
            title="Nagranie lekcji"
            text="Nagraj krótkie podsumowanie, sprawdź transkrypcję i dopiero wtedy wyślij materiał do AI."
            compact
          />
        </div>

        {/* Wybór klasy */}
        <div style={s.row}>
          <label style={s.label}>Klasa</label>
          <select
            style={s.select}
            value={selectedClass}
            onChange={e => setSelectedClass(e.target.value)}
            disabled={state === 'recording' || state === 'sending'}
          >
            {classes.map(c => (
              <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>
            ))}
          </select>
        </div>

        {/* 4 prompty pomocnicze */}
        <div style={s.promptsBox}>
          <p style={s.promptsTitle}>Pamiętaj żeby powiedzieć:</p>
          <div style={s.promptsList}>
            {PROMPTS.map((p, i) => (
              <div key={i} style={s.prompt}>
                <span style={s.promptNum}>{i + 1}</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Nagrywanie */}
        <div style={s.recorderBox}>
          {state === 'recording' && (
            <div style={s.timerRow}>
              <span style={s.recDot} />
              <span style={{ ...s.timer, color: isOverWarning ? '#ef4444' : '#111827' }}>
                {formatTime(seconds)}
              </span>
              <span style={{ ...s.timeLeft, color: isOverWarning ? '#ef4444' : '#9ca3af' }}>
                (zostało {formatTime(timeLeft)})
              </span>
            </div>
          )}

          {state !== 'done' && state !== 'sending' && !reviewAudioUrl && (
            <button
              style={{ ...s.bigBtn, background: state === 'recording' ? '#ef4444' : '#2563eb' }}
              onClick={state === 'recording' ? handleStop : handleStart}
            >
              {state === 'recording' ? '⏹ Zatrzymaj nagrywanie' : '🎙 Rozpocznij nagrywanie'}
            </button>
          )}

          {reviewAudioUrl && state !== 'done' && state !== 'sending' && (
            <div style={s.doneRow}>
              <p style={s.doneText}>✅ Nagranie gotowe ({reviewSource === 'mobile_qr' ? 'telefon' : formatTime(seconds)})</p>
              <audio controls src={reviewAudioUrl} style={{ marginBottom: 16, width: '100%' }} />
              <textarea
                style={s.textarea}
                placeholder="Tu pojawi się transkrypcja. Możesz ją też wkleić lub poprawić ręcznie przed wysłaniem."
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
              />
              {isTranscribing && <p style={s.statusHint}>⏳ Trwa automatyczna transkrypcja...</p>}
              {transcriptionError && <p style={s.errorHint}>❌ {transcriptionError}</p>}
              {transcriptionError && (
                <button
                  style={s.retryBtn}
                  type="button"
                  onClick={handleGenerateTranscript}
                  disabled={isTranscribing || isApproving}
                >
                  Spróbuj transkrypcję ponownie
                </button>
              )}
              <div style={s.btnRow}>
                <button style={s.secondaryBtn} disabled={isTranscribing || isApproving} onClick={() => {
                  setReviewAudioUrl('')
                  setReviewAudioPath('')
                  setReviewAudioBlob(null)
                  setAudioBlob(null)
                  setTranscript('')
                  setTranscriptionError('')
                  setTranscriptionInfo('')
                  setUploadError('')
                  setAutoTranscriptAttempted(false)
                  setSeconds(0)
                }}>
                  Nagraj ponownie
                </button>
                <button style={s.bigBtn} disabled={isApproving || isTranscribing} onClick={handleApproveAndSend}>
                  {isApproving ? 'Wysyłanie...' : 'Zatwierdź i wyślij do AI'}
                </button>
              </div>
            </div>
          )}

          {state === 'sending' && (
            <div style={s.statusBox}>
              <p style={s.statusText}>⏳ Wysyłanie do AI... To może potrwać chwilę.</p>
            </div>
          )}

          {state === 'done' && (
            <div style={{ ...s.statusBox, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <IllustrationState
                type="success"
                title="Lekcja wysłana"
                text={successMessage}
                compact
              />
              <button style={s.bigBtn} onClick={() => navigate('/teacher')}>
                Wróć do panelu
              </button>
            </div>
          )}

          {state === 'error' && (
            <div style={{ ...s.statusBox, background: '#fef2f2', border: '1px solid #fecaca' }}>
              <IllustrationState
                type="error"
                title="Błąd wysyłania"
                text={uploadError || 'Sprawdź połączenie i spróbuj ponownie.'}
                compact
              />
              <button style={s.bigBtn} onClick={handleApproveAndSend}>Spróbuj ponownie</button>
            </div>
          )}
        </div>

        <div style={s.mobileBox}>
          <p style={s.mobileTitle}>Nie działa mikrofon na komputerze?</p>
          <p style={s.mobileHint}>Wygeneruj QR, nagraj telefonem i wróć tutaj. Komputer pokaże status automatycznie.</p>

          {!mobileSession && (
            <button
              style={s.secondaryBtn}
              onClick={handleCreateMobileSession}
              disabled={mobileLoading || !selectedClass}
            >
              {mobileLoading ? 'Tworzenie sesji...' : '📱 Nagraj telefonem (QR)'}
              {transcriptionInfo && <p style={s.infoHint}>ℹ️ {transcriptionInfo}</p>}
            </button>
          )}

          {mobileSession && (
            <div style={s.mobileCard}>
              <img
                src={`https://quickchart.io/qr?size=220&margin=1&text=${encodeURIComponent(mobileSession.url)}`}
                alt="QR do nagrania telefonem"
                style={s.qr}
              />
              <p style={s.mobileCode}>Status: {mobileSession.status === 'waiting' ? 'Czeka na telefon' : mobileSession.status === 'recording' ? 'Nagrywanie w toku' : mobileSession.status === 'uploading' ? 'Wysyłanie z telefonu' : mobileSession.status === 'queued_offline' ? 'Brak internetu - czeka na ponowienie' : mobileSession.status === 'uploaded' ? 'Nagranie gotowe do review' : mobileSession.status === 'done' ? 'Zatwierdzone i wysłane do AI' : 'Błąd'}</p>
              {!!mobileSession.error && <p style={{ ...s.mobileCode, color: '#dc2626' }}>{mobileSession.error}</p>}
              {mobileSession.status === 'uploaded' && (
                <p style={{ ...s.mobileCode, color: '#16a34a' }}>✅ Odsłuchaj, sprawdź transkrypcję i zatwierdź na komputerze.</p>
              )}
              {mobileSession.status === 'done' && (
                <p style={{ ...s.mobileCode, color: '#16a34a' }}>✅ Lekcja zatwierdzona i wysłana do AI.</p>
              )}
              <div style={s.mobileButtons}>
                <a href={mobileSession.url} target="_blank" rel="noreferrer" style={s.linkBtn}>Otwórz link</a>
                <button style={s.iconBtn} onClick={handleCloseMobileSession}>Zamknij sesję</button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', fontFamily: 'sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 32px', background: '#fff', borderBottom: '1px solid #e5e7eb' },
  backBtn: { background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14 },
  logo: { fontSize: 20, fontWeight: 700, color: '#2563eb' },
  main: { maxWidth: 640, margin: '0 auto', padding: '32px 24px' },
  title: { fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 24 },
  recordingIntro: { marginBottom: 18, overflow: 'hidden' },
  row: { marginBottom: 20 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  select: { width: '100%', padding: '10px 14px', fontSize: 15, border: '1px solid #d1d5db', borderRadius: 8, outline: 'none' },
  promptsBox: { background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '18px 20px', marginBottom: 28 },
  promptsTitle: { fontSize: 13, fontWeight: 600, color: '#1d4ed8', marginBottom: 12 },
  promptsList: { display: 'flex', flexDirection: 'column', gap: 10 },
  prompt: { display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, color: '#1e40af' },
  promptNum: { minWidth: 22, height: 22, background: '#2563eb', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  recorderBox: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 16, padding: '28px', textAlign: 'center' },
  timerRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 20 },
  recDot: { width: 10, height: 10, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1s infinite' },
  timer: { fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums' },
  timeLeft: { fontSize: 13 },
  bigBtn: { padding: '14px 28px', fontSize: 15, fontWeight: 600, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer' },
  secondaryBtn: { padding: '14px 20px', fontSize: 14, fontWeight: 500, background: 'none', border: '1px solid #d1d5db', borderRadius: 10, cursor: 'pointer', color: '#374151' },
  doneRow: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  doneText: { fontSize: 15, color: '#16a34a', fontWeight: 600, marginBottom: 4 },
  textarea: { width: '100%', minHeight: 150, borderRadius: 10, border: '1px solid #cbd5e1', padding: 12, fontSize: 14, lineHeight: 1.5, resize: 'vertical', marginBottom: 8 },
  statusHint: { margin: '0 0 6px', fontSize: 13, color: '#334155' },
  infoHint: { margin: '0 0 6px', fontSize: 13, color: '#0369a1' },
  errorHint: { margin: '0 0 6px', fontSize: 13, color: '#dc2626' },
  retryBtn: { padding: '10px 14px', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 10, cursor: 'pointer', marginBottom: 10 },
  btnRow: { display: 'flex', gap: 12 },
  statusBox: { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px', marginTop: 8 },
  statusText: { fontSize: 15, color: '#374151', marginBottom: 16 },
  mobileBox: { marginTop: 18, background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 16, padding: 18, textAlign: 'center' },
  mobileTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: '#111827' },
  mobileHint: { margin: '8px 0 14px', fontSize: 13, color: '#6b7280' },
  mobileCard: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  qr: { width: 220, height: 220, borderRadius: 12, border: '1px solid #e5e7eb' },
  mobileCode: { margin: 0, fontSize: 13, color: '#334155' },
  mobileButtons: { display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' },
  linkBtn: { padding: '10px 14px', fontSize: 13, fontWeight: 600, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 10, textDecoration: 'none' },
  iconBtn: { padding: '10px 14px', fontSize: 13, fontWeight: 600, background: '#f9fafb', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, cursor: 'pointer' },
}
