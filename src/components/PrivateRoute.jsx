import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function PrivateRoute({ children, role }) {
  const { user, role: userRole, passwordSetupRequired } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (role && userRole !== role) return <Navigate to="/login" replace />
  if (userRole === 'student' && passwordSetupRequired) return <Navigate to="/login" replace />

  return children
}
