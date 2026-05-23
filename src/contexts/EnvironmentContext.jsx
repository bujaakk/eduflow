import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '../firebase'

const EnvironmentContext = createContext(null)
const STORAGE_KEY = 'eduflow-environment-slug'
const DEFAULT_ENVIRONMENT = {
  id: 'default',
  name: 'EduFlow',
  slug: 'default',
  type: 'default',
  status: 'active',
}

function normalizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function readPathSlug() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  return parts[0] === 'e' ? normalizeSlug(parts[1]) : ''
}

function readHostSlug() {
  const host = window.location.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return ''
  const first = host.split('.')[0]
  return ['www', 'app', 'eduflow'].includes(first) ? '' : normalizeSlug(first)
}

function readStoredSlug() {
  try {
    return normalizeSlug(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return ''
  }
}

function writeStoredSlug(slug) {
  try {
    if (slug && slug !== 'default') window.localStorage.setItem(STORAGE_KEY, slug)
  } catch {
    // no-op
  }
}

export function environmentMatches(documentEnvironmentId, activeEnvironmentId) {
  const docEnv = documentEnvironmentId || 'default'
  const activeEnv = activeEnvironmentId || 'default'
  return activeEnv === 'default' ? docEnv === 'default' : docEnv === activeEnv
}

export function EnvironmentProvider({ children }) {
  const [environment, setEnvironment] = useState(DEFAULT_ENVIRONMENT)
  const [loading, setLoading] = useState(true)
  const pathSlug = readPathSlug()
  const hostSlug = readHostSlug()
  const selectedSlug = pathSlug || hostSlug || readStoredSlug() || 'default'

  useEffect(() => {
    let cancelled = false

    const loadEnvironment = async () => {
      const slug = normalizeSlug(selectedSlug) || 'default'
      if (slug === 'default') {
        if (!cancelled) {
          setEnvironment(DEFAULT_ENVIRONMENT)
          setLoading(false)
        }
        return
      }

      try {
        const snap = await getDocs(query(collection(db, 'environments'), where('slug', '==', slug)))
        const envDoc = snap.docs[0]
        if (!cancelled) {
          setEnvironment(envDoc ? { id: envDoc.id, ...envDoc.data() } : { ...DEFAULT_ENVIRONMENT, slug, name: slug, missing: true })
          writeStoredSlug(slug)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setEnvironment({ ...DEFAULT_ENVIRONMENT, slug, name: slug, missing: true })
          setLoading(false)
        }
      }
    }

    loadEnvironment()
    return () => { cancelled = true }
  }, [selectedSlug])

  const value = useMemo(() => {
    const usePathPrefix = !!pathSlug && environment.slug && environment.slug !== 'default'
    const buildPath = (path) => {
      const normalizedPath = path.startsWith('/') ? path : `/${path}`
      return usePathPrefix ? `/e/${environment.slug}${normalizedPath}` : normalizedPath
    }

    return {
      environment,
      environmentId: environment?.id || 'default',
      environmentSlug: environment?.slug || 'default',
      isDefaultEnvironment: !environment || environment.id === 'default',
      loading,
      buildPath,
    }
  }, [environment, loading, pathSlug])

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>
}

export function useEnvironment() {
  return useContext(EnvironmentContext)
}