import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { useAuth } from '../contexts/AuthContext'
import { useEnvironment } from '../contexts/EnvironmentContext'
import { db } from '../firebase'

function unprefixedPath(pathname, fallbackPath) {
  const stripped = pathname.replace(/^\/e\/[^/]+/, '')
  return stripped && stripped !== '/' ? stripped : fallbackPath
}

function hasEnvironmentPrefix(pathname) {
  return /^\/e\/[^/]+/.test(pathname)
}

export default function PrivateRoute({ children, role }) {
  const { user, role: userRole, teacherProfile, studentProfile, passwordSetupRequired } = useAuth()
  const { environmentId, environmentSlug, isDefaultEnvironment, buildPath } = useEnvironment()
  const location = useLocation()
  const [targetEnvironmentPath, setTargetEnvironmentPath] = useState('')
  const [redirectLoading, setRedirectLoading] = useState(false)

  const profile = userRole === 'teacher' ? teacherProfile : studentProfile
  const profileEnvironmentId = profile?.environmentId || 'default'

  useEffect(() => {
    let cancelled = false
    setTargetEnvironmentPath('')
    setRedirectLoading(false)
    if (!user || !userRole || !profileEnvironmentId || profileEnvironmentId === 'default') return () => { cancelled = true }
    if (!isDefaultEnvironment && profileEnvironmentId === environmentId && hasEnvironmentPrefix(location.pathname)) return () => { cancelled = true }
    if (!isDefaultEnvironment && profileEnvironmentId === environmentId && environmentSlug && environmentSlug !== 'default') {
      const fallbackPath = userRole === 'student' ? '/student' : '/teacher'
      setTargetEnvironmentPath(`/e/${environmentSlug}${unprefixedPath(location.pathname, fallbackPath)}`)
      return () => { cancelled = true }
    }
    setRedirectLoading(true)

    const loadEnvironmentPath = async () => {
      try {
        const snap = await getDoc(doc(db, 'environments', profileEnvironmentId))
        const slug = snap.exists() ? snap.data()?.slug : ''
        if (!cancelled && slug) {
          const fallbackPath = userRole === 'student' ? '/student' : '/teacher'
          setTargetEnvironmentPath(`/e/${slug}${unprefixedPath(location.pathname, fallbackPath)}`)
        }
      } catch {
        if (!cancelled) setTargetEnvironmentPath('')
      } finally {
        if (!cancelled) setRedirectLoading(false)
      }
    }

    loadEnvironmentPath()
    return () => { cancelled = true }
  }, [user, userRole, profileEnvironmentId, isDefaultEnvironment, environmentId, environmentSlug, location.pathname])

  if (!user) return <Navigate to={buildPath('/login')} replace />
  // Firebase Auth przywrócił sesję, ale Firestore jeszcze nie załadował roli
  // (np. chwilowe opóźnienie przy hard refresh) — poczekaj zamiast przekierowywać.
  if (!userRole) return null
  if (role && userRole !== role) return <Navigate to={buildPath('/login')} replace />
  if (targetEnvironmentPath) return <Navigate to={targetEnvironmentPath} replace />
  if (redirectLoading && profileEnvironmentId !== 'default' && (isDefaultEnvironment || profileEnvironmentId !== environmentId)) return null
  if (!isDefaultEnvironment && profileEnvironmentId !== environmentId) return <Navigate to={buildPath('/login')} replace />
  if (userRole === 'student' && passwordSetupRequired) return <Navigate to={buildPath('/login')} replace />

  return children
}
