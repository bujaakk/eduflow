import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../../firebase'
import Logo from '../../components/Logo'

const MAX_SECONDS = 180
const IDB_NAME = 'eduflow-mobile-recordings'
const IDB_STORE = 'pendingUploads'
const MOBILE_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
]

function pickSupportedMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return ''
  const supported = MOBILE_MIME_CANDIDATES.find((type) => window.MediaRecorder.isTypeSupported(type))
  return supported || ''
}

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => {
      const dbInstance = request.result
      if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
        dbInstance.createObjectStore(IDB_STORE, { keyPath: 'sessionId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function savePendingUpload(record) {
  const dbInstance = await openQueueDb()
  await new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(record)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  dbInstance.close()
}

async function loadPendingUpload(sessionId) {
  const dbInstance = await openQueueDb()
  const record = await new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(IDB_STORE, 'readonly')
    const req = tx.objectStore(IDB_STORE).get(sessionId)
    req.onsuccess = () => resolve(req.result || null)
    req.onerror = () => reject(req.error)
  })
  dbInstance.close()
  return record
}

async function removePendingUpload(sessionId) {
  const dbInstance = await openQueueDb()
  await new Promise((resolve, reject) => {
    const tx = dbInstance.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).delete(sessionId)
    tx.oncomplete = resolve
    tx.onerror = () => reject(tx.error)
  })
  dbInstance.close()
}

export default function MobileRecordLesson() {
  const [params] = useSearchParams()
  const sessionId = params.get('session')

  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [state, setState] = useState('idle') // idle | recording | uploading | queued | done | error
  const [seconds, setSeconds] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [audioPreviewUrl, setAudioPreviewUrl] = useState('')
  const [audioMimeType, setAudioMimeType] = useState('audio/webm')
  const [mobileError, setMobileError] = useState('')

  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    const loadSession = async () => {
      if (!sessionId) {
        setLoading(false)
        return
      }

      try {
        const snap = await getDoc(doc(db, 'recordingSessions', sessionId))
        if (!snap.exists()) {
          setMobileError('Sesja nagrywania nie istnieje lub wygasla.')
          setLoading(false)
          return
        }

        setSession({ id: snap.id, ...snap.data() })
      } catch {
        setMobileError('Nie udalo sie pobrac sesji. Otworz kod QR ponownie.')
      } finally {
        setLoading(false)
      }
    }

    loadSession()
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || !session) return
    let disposed = false

    const retryPending = async () => {
      try {
        const pending = await loadPendingUpload(sessionId)
        if (!pending || disposed || !navigator.onLine) return
        await uploadAudioToSession(pending.blob, pending.seconds)
      } catch {
        if (!disposed) {
          setMobileError('Nie udalo sie wznowic lokalnej wysylki. Sprobuj wyslac nagranie ponownie.')
        }
      }
    }

    retryPending()
    const onOnline = () => {
      retryPending()
    }

    window.addEventListener('online', onOnline)
    return () => {
      disposed = true
      window.removeEventListener('online', onOnline)
    }
  }, [sessionId, session])

  useEffect(() => {
    if (!audioBlob) {
      setAudioPreviewUrl('')
      return
    }

    const nextUrl = URL.createObjectURL(audioBlob)
    setAudioPreviewUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [audioBlob])

  useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
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

  const updateSession = async (patch) => {
    if (!sessionId) return
    await updateDoc(doc(db, 'recordingSessions', sessionId), patch)
  }

  const handleStart = async () => {
    try {
      if (typeof window === 'undefined' || !window.MediaRecorder) {
        const msg = 'Ta wersja Safari nie wspiera nagrywania przez przeglądarkę. Użyj opcji: Wgraj plik audio.'
        setMobileError(msg)
        setState('error')
        await updateSession({ status: 'error', error: msg })
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickSupportedMimeType()
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      chunksRef.current = []
      setMobileError('')

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data)
      recorder.onstop = () => {
        const finalType = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type: finalType })
        setAudioBlob(blob)
        setAudioMimeType(finalType)
        stream.getTracks().forEach((t) => t.stop())
      }

      await updateSession({ status: 'recording', startedAt: serverTimestamp(), error: '' })
      recorder.start()
      setSeconds(0)
      setState('recording')
    } catch (err) {
      setState('error')
      const msg = err?.message ? `Brak dostepu do mikrofonu: ${err.message}` : 'Brak dostepu do mikrofonu na telefonie.'
      setMobileError(msg)
      try {
        await updateSession({ status: 'error', error: msg })
      } catch {
        // no-op: fallback UI is enough when network/session write fails
      }
    }
  }

  const handleStop = () => {
    clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setState('idle')
  }

  const uploadAudioToSession = async (blob, durationSeconds) => {
    if (!sessionId || !session) return

    setState('uploading')
    await updateSession({ status: 'uploading', error: '' })

    const normalizedType = blob.type || audioMimeType || 'audio/webm'
    const extension = normalizedType.includes('mp4') ? 'm4a' : normalizedType.includes('mpeg') ? 'mp3' : 'webm'
    const storagePath = `recordings/${sessionId}/mobile-${Date.now()}.${extension}`
    const audioRef = ref(storage, storagePath)
    await uploadBytes(audioRef, blob, { contentType: normalizedType })
    const audioUrl = await getDownloadURL(audioRef)

    await updateSession({
      status: 'uploaded',
      audioUrl,
      storagePath,
      source: 'mobile_qr',
      audioMimeType: normalizedType,
      durationSeconds,
      finishedAt: serverTimestamp(),
      error: '',
    })

    await removePendingUpload(sessionId)
    setState('done')
  }

  const handleSelectAudioFile = () => {
    fileInputRef.current?.click()
  }

  const handleAudioFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAudioBlob(file)
    setAudioMimeType(file.type || 'audio/mpeg')
    setMobileError('')
    e.target.value = ''
  }

  const handleSend = async () => {
    if (!audioBlob || !session) return

    try {
      await uploadAudioToSession(audioBlob, seconds)
    } catch {
      try {
        await savePendingUpload({
          sessionId,
          blob: audioBlob,
          seconds,
          queuedAt: Date.now(),
        })
        await updateSession({ status: 'queued_offline', error: 'Brak internetu. Wyśle się automatycznie po powrocie sieci.' })
        setState('queued')
      } catch {
        setState('error')
        const msg = 'Nie udalo sie zapisac nagrania offline.'
        setMobileError(msg)
        await updateSession({ status: 'error', error: msg })
      }
    }
  }

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  if (loading) {
    return <div style={s.page}><p style={s.hint}>Ladowanie sesji...</p></div>
  }

  if (!sessionId || !session) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <Logo height={30} />
          <h1 style={s.title}>Nieprawidlowy link</h1>
          <p style={s.hint}>{mobileError || 'Otworz kod QR wygenerowany na komputerze.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={s.page}>
      <div style={s.card}>
        <Logo height={30} />
        <h1 style={s.title}>Nagrywanie z telefonu</h1>
        <p style={s.hint}>Po wyslaniu nagrania komputer nauczyciela od razu dostanie audio do odsluchu i zatwierdzenia.</p>
        {!!mobileError && state !== 'error' && <p style={{ ...s.hint, color: '#dc2626' }}>{mobileError}</p>}

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          capture="microphone"
          style={{ display: 'none' }}
          onChange={handleAudioFileChange}
        />

        {state !== 'done' && state !== 'uploading' && !audioBlob && (
          <div style={s.row}>
            <button style={{ ...s.btn, background: state === 'recording' ? '#ef4444' : '#2563eb' }} onClick={state === 'recording' ? handleStop : handleStart}>
              {state === 'recording' ? `Zatrzymaj (${formatTime(seconds)})` : 'Rozpocznij nagrywanie'}
            </button>
            <button style={s.secondaryBtn} onClick={handleSelectAudioFile}>Wgraj plik audio (iPhone)</button>
          </div>
        )}

        {audioBlob && state !== 'done' && state !== 'uploading' && (
          <>
            <p style={{ ...s.hint, color: '#16a34a' }}>Nagranie gotowe ({formatTime(seconds)})</p>
            <audio controls src={audioPreviewUrl} style={{ width: '100%', marginBottom: 12 }} />
            <div style={s.row}>
              <button style={s.secondaryBtn} onClick={() => { setAudioBlob(null); setSeconds(0) }}>
                Nagraj ponownie
              </button>
              <button style={s.btn} onClick={handleSend}>Wyslij na komputer</button>
            </div>
          </>
        )}

        {state === 'uploading' && <p style={s.hint}>Wysylanie nagrania...</p>}
        {state === 'queued' && <p style={{ ...s.hint, color: '#d97706', fontWeight: 700 }}>Brak internetu. Plik zapisany lokalnie, wysle sie sam po powrocie sieci.</p>}
        {state === 'done' && <p style={{ ...s.hint, color: '#16a34a', fontWeight: 700 }}>Gotowe! Wroc do komputera i zatwierdz lekcje.</p>}
        {state === 'error' && <p style={{ ...s.hint, color: '#dc2626' }}>Blad. Sprobuj ponownie.</p>}
        {!!mobileError && <p style={{ ...s.hint, color: '#dc2626' }}>{mobileError}</p>}
      </div>
    </div>
  )
}

const s = {
  page: { minHeight: '100vh', background: '#f8fafc', display: 'grid', placeItems: 'center', padding: 16, fontFamily: 'sans-serif' },
  card: { width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, textAlign: 'center' },
  title: { fontSize: 24, margin: '10px 0 8px', color: '#111827' },
  hint: { fontSize: 14, color: '#64748b', marginBottom: 14 },
  btn: { padding: '12px 18px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, width: '100%' },
  secondaryBtn: { padding: '12px 18px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 10, fontSize: 15, fontWeight: 600, width: '100%' },
  row: { display: 'grid', gap: 8 },
}
