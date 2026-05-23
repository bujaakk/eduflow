import { auth } from '../firebase'

const AUDIO_WEBHOOK_URL = import.meta.env.VITE_AUDIO_WEBHOOK_URL || 'https://n8n.yourwayai.pl/webhook/eduflow-audio'
const AUDIO_WEBHOOK_SECRET = import.meta.env.VITE_AUDIO_WEBHOOK_SECRET || 'eduflow-secret-2026'
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_AUDIO_WEBHOOK_TIMEOUT_MS || 45000)

export class UploadLessonError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'UploadLessonError'
    this.code = code
    this.status = details.status ?? null
    this.payload = details.payload ?? null
    this.cause = details.cause
  }
}

const getAudioFileName = (blob) => {
  const mime = (blob?.type || '').toLowerCase()
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'lesson.mp3'
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'lesson.m4a'
  if (mime.includes('ogg')) return 'lesson.ogg'
  if (mime.includes('wav')) return 'lesson.wav'
  return 'lesson.webm'
}

const getBinaryFieldNames = (value) => {
  if (!Array.isArray(value) || value.length === 0) return ['data', 'audio', 'file']
  const names = value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return names.length > 0 ? names : ['data', 'audio', 'file']
}

const parseResponseBody = async (response) => {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    try {
      return await response.json()
    } catch {
      return null
    }
  }

  const raw = await response.text()
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

const normalizeMessage = (payload, fallback) => {
  if (!payload) return fallback
  if (typeof payload === 'string' && payload.trim()) return payload
  if (typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
    if (typeof payload.reason === 'string' && payload.reason.trim()) return payload.reason

    if (Array.isArray(payload.detail) && payload.detail.length > 0) {
      const first = payload.detail[0]
      if (typeof first === 'string' && first.trim()) return first
      if (first && typeof first === 'object') {
        if (typeof first.msg === 'string' && first.msg.trim()) return first.msg
        if (typeof first.message === 'string' && first.message.trim()) return first.message
      }
    }

    const debug = payload.debug
    if (debug && typeof debug === 'object') {
      const bits = []
      if (typeof debug.noteLength === 'number') bits.push(`noteLength=${debug.noteLength}`)
      if (typeof debug.quizCount === 'number') bits.push(`quizCount=${debug.quizCount}`)
      if (typeof debug.studentIdsCount === 'number') bits.push(`studentIdsCount=${debug.studentIdsCount}`)
      if (typeof debug.tasksCreated === 'number') bits.push(`tasksCreated=${debug.tasksCreated}`)
      if (bits.length > 0) return `${fallback} (${bits.join(', ')})`
    }

    try {
      const raw = JSON.stringify(payload)
      if (raw && raw !== '{}') return raw.slice(0, 500)
    } catch {
      // Fall through to the generic fallback below.
    }
  }
  return fallback
}

export async function uploadLesson(audioBlob, classId, options = {}) {
  const teacherId = auth.currentUser?.uid
  if (!teacherId) {
    throw new UploadLessonError('unauthenticated', 'Brak zalogowanego nauczyciela.')
  }

  const hasBlob = audioBlob instanceof Blob
  const remoteAudioUrl = typeof options.remoteAudioUrl === 'string' ? options.remoteAudioUrl.trim() : ''
  const remoteStoragePath = typeof options.remoteStoragePath === 'string' ? options.remoteStoragePath.trim() : ''
  const hasRemoteAudio = Boolean(remoteAudioUrl)
  const preferRemoteAudio = options.preferRemoteAudio !== false
  const shouldSendBlob = hasBlob && (!hasRemoteAudio || !preferRemoteAudio)

  if (!shouldSendBlob && !hasRemoteAudio) {
    throw new UploadLessonError('invalid_audio', 'Brak nagrania audio do wysłania.')
  }

  if (!classId || typeof classId !== 'string') {
    throw new UploadLessonError('invalid_class_id', 'Brak wybranej klasy.')
  }

  const formData = new FormData()
  if (shouldSendBlob) {
    const fileName = getAudioFileName(audioBlob)
    const mime = audioBlob?.type || ''
    getBinaryFieldNames(options.binaryFieldNames).forEach((fieldName) => {
      formData.append(fieldName, audioBlob, fileName)
    })
    if (mime) formData.append('audioMimeType', mime)
  }
  if (hasRemoteAudio) {
    formData.append('audioUrl', remoteAudioUrl)
  }
  if (remoteStoragePath) {
    formData.append('storagePath', remoteStoragePath)
  }
  formData.append('teacherId', teacherId)
  formData.append('classId', classId)
  formData.append('timestamp', new Date().toISOString())

  if (options.extraFields && typeof options.extraFields === 'object') {
    Object.entries(options.extraFields).forEach(([key, value]) => {
      if (value === undefined || value === null) return
      formData.append(key, String(value))
    })
  }

  const controller = new AbortController()
  const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS)
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(AUDIO_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'X-EduFlow-Secret': AUDIO_WEBHOOK_SECRET,
      },
      body: formData,
      signal: controller.signal,
    })

    const payload = await parseResponseBody(response)

    if (!response.ok) {
      console.error('EduFlow audio webhook failed', {
        status: response.status,
        payload,
      })
      throw new UploadLessonError(
        'http_error',
        normalizeMessage(payload, `Błąd uploadu (${response.status}).`),
        { status: response.status, payload }
      )
    }

    if (payload && typeof payload === 'object' && payload.success === false) {
      throw new UploadLessonError(
        'processing_error',
        normalizeMessage(payload, 'Webhook zwrócił błąd przetwarzania.'),
        { status: response.status, payload }
      )
    }

    return payload
  } catch (error) {
    if (error instanceof UploadLessonError) throw error
    if (error?.name === 'AbortError') {
      throw new UploadLessonError('timeout', 'Przekroczono limit czasu oczekiwania na webhook.', { cause: error })
    }
    throw new UploadLessonError('network_error', 'Nie udało się połączyć z webhookiem.', { cause: error })
  } finally {
    clearTimeout(timeoutId)
  }
}