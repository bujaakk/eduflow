import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { auth, storage } from '../firebase'

const PDF_MATERIAL_WEBHOOK_URL = import.meta.env.VITE_PDF_MATERIAL_WEBHOOK_URL || 'https://n8n.yourwayai.pl/webhook/eduflow-pdf-material'
const PDF_MATERIAL_WEBHOOK_SECRET = import.meta.env.VITE_AUDIO_WEBHOOK_SECRET || 'eduflow-secret-2026'
const DEFAULT_TIMEOUT_MS = Number(import.meta.env.VITE_PDF_MATERIAL_TIMEOUT_MS || 60000)

export class UploadPdfMaterialError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'UploadPdfMaterialError'
    this.code = code
    this.status = details.status ?? null
    this.payload = details.payload ?? null
    this.cause = details.cause
  }
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

const normalizeFileName = (name) => String(name || 'material.pdf')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .slice(0, 90)

const normalizeMessage = (payload, fallback) => {
  if (!payload) return fallback
  if (typeof payload === 'string' && payload.trim()) return payload
  if (typeof payload === 'object') {
    if (typeof payload.message === 'string' && payload.message.trim()) return payload.message
    if (typeof payload.error === 'string' && payload.error.trim()) return payload.error
    if (typeof payload.reason === 'string' && payload.reason.trim()) return payload.reason
  }
  return fallback
}

export async function uploadPdfMaterial(file, classMeta, options = {}) {
  const teacherId = auth.currentUser?.uid
  if (!teacherId) {
    throw new UploadPdfMaterialError('unauthenticated', 'Brak zalogowanego nauczyciela.')
  }

  if (!(file instanceof File)) {
    throw new UploadPdfMaterialError('invalid_file', 'Wybierz plik PDF.')
  }

  if (file.type && file.type !== 'application/pdf') {
    throw new UploadPdfMaterialError('invalid_type', 'Materiały dodatkowe obsługują tylko PDF.')
  }

  const classId = classMeta?.id
  if (!classId) {
    throw new UploadPdfMaterialError('invalid_class_id', 'Brak wybranej klasy.')
  }

  const storagePath = `materials/${teacherId}/${classId}/${Date.now()}-${normalizeFileName(file.name)}`
  const pdfRef = ref(storage, storagePath)
  await uploadBytes(pdfRef, file, { contentType: 'application/pdf' })
  const pdfUrl = await getDownloadURL(pdfRef)

  const target = options.target === 'lesson' ? 'lesson' : 'material'
  const isLessonTarget = target === 'lesson'
  const title = String(options.title || file.name.replace(/\.pdf$/i, '') || (isLessonTarget ? 'Lekcja z PDF' : 'Materiał PDF')).trim()
  const formData = new FormData()
  formData.append('data', file, file.name)
  formData.append('pdf', file, file.name)
  formData.append('file', file, file.name)
  formData.append('pdfUrl', pdfUrl)
  formData.append('storagePath', storagePath)
  formData.append('teacherId', teacherId)
  formData.append('classId', classId)
  formData.append('className', classMeta?.name ?? '')
  formData.append('classSubject', classMeta?.subject ?? '')
  formData.append('title', title)
  formData.append('source', isLessonTarget ? 'pdf_lesson' : 'pdf_material')
  formData.append('workflowMode', isLessonTarget ? 'pdf_to_lesson' : 'pdf_to_material')
  formData.append('collection', isLessonTarget ? 'lessons' : 'materials')
  formData.append('targetCollection', isLessonTarget ? 'lessons' : 'materials')
  formData.append('category', isLessonTarget ? 'lesson' : 'additional_materials')
  formData.append('type', isLessonTarget ? 'lesson' : 'additional_material')
  formData.append('shouldCreateTasks', isLessonTarget ? 'true' : 'false')
  formData.append('titleInstruction', isLessonTarget
    ? 'Rozpoznaj z PDF temat lekcji i zapisz krotki, czytelny tytul lekcji.'
    : 'Rozpoznaj z PDF krotka nazwe notatki, skroc ja i zapisz jako przyjazny tytul dla ucznia.')
  if (!isLessonTarget) {
    formData.append('materialFormatInstruction', 'Nie tworz krotkiej notatki. Przygotuj bogaty, czytelny material dla ucznia: dluzszy opis, sekcje tematyczne, kluczowe pojecia, najwazniejsze wnioski i pytania do powtorki. Zapisz tez strukturalne pola sections, keyPoints, importantTerms oraz recapQuestions, jesli to mozliwe.')
  }
  formData.append('timestamp', new Date().toISOString())

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), Number(options.timeoutMs || DEFAULT_TIMEOUT_MS))

  try {
    const response = await fetch(PDF_MATERIAL_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'X-EduFlow-Secret': PDF_MATERIAL_WEBHOOK_SECRET,
      },
      body: formData,
      signal: controller.signal,
    })

    const payload = await parseResponseBody(response)
    if (!response.ok) {
      throw new UploadPdfMaterialError(
        'http_error',
        normalizeMessage(payload, `Błąd uploadu PDF (${response.status}).`),
        { status: response.status, payload }
      )
    }

    if (payload && typeof payload === 'object' && payload.success === false) {
      throw new UploadPdfMaterialError(
        'processing_error',
        normalizeMessage(payload, 'Webhook zwrócił błąd przetwarzania PDF.'),
        { status: response.status, payload }
      )
    }

    return { payload, pdfUrl, storagePath, title }
  } catch (error) {
    if (error instanceof UploadPdfMaterialError) throw error
    if (error?.name === 'AbortError') {
      throw new UploadPdfMaterialError('timeout', 'Przekroczono limit czasu oczekiwania na webhook PDF.', { cause: error })
    }
    throw new UploadPdfMaterialError('network_error', 'Nie udało się połączyć z webhookiem PDF.', { cause: error })
  } finally {
    clearTimeout(timeoutId)
  }
}