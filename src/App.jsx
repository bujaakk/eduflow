import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { EnvironmentProvider, useEnvironment } from './contexts/EnvironmentContext'
import PrivateRoute from './components/PrivateRoute'
import { initAnalytics, trackPageView } from './services/analytics'
import Login from './pages/Login'
import Admin from './pages/Admin'
import TeacherDashboard from './pages/teacher/Dashboard'
import ClassView from './pages/teacher/ClassView'
import RecordLesson from './pages/teacher/RecordLesson'
import MobileRecordLesson from './pages/teacher/MobileRecordLesson'
import LessonList from './pages/teacher/LessonList'
import LessonProfile from './pages/teacher/LessonProfile'
import StudentProfile from './pages/teacher/StudentProfile'
import StudentDashboard from './pages/student/Dashboard'
import LessonTasks from './pages/student/LessonTasks'
import NoteView from './pages/student/NoteView'
import MaterialView from './pages/student/MaterialView'
import MyProfile from './pages/student/MyProfile'

const T = ({ children }) => <PrivateRoute role="teacher">{children}</PrivateRoute>
const S = ({ children }) => <PrivateRoute role="student">{children}</PrivateRoute>

function EnvironmentRedirect({ to }) {
  const { buildPath } = useEnvironment()
  return <Navigate to={buildPath(to)} replace />
}

export default function App() {
  const location = useLocation()

  useEffect(() => {
    initAnalytics()
  }, [])

  useEffect(() => {
    trackPageView(location.pathname, location.search)
  }, [location.pathname, location.search])

  return (
    <EnvironmentProvider>
      <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/e/:environmentSlug/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />

        {/* Panel nauczyciela */}
        <Route path="/teacher" element={<T><TeacherDashboard /></T>} />
        <Route path="/e/:environmentSlug/teacher" element={<T><TeacherDashboard /></T>} />
        <Route path="/teacher/class/:classId" element={<T><ClassView /></T>} />
        <Route path="/e/:environmentSlug/teacher/class/:classId" element={<T><ClassView /></T>} />
        <Route path="/teacher/record" element={<T><RecordLesson /></T>} />
        <Route path="/e/:environmentSlug/teacher/record" element={<T><RecordLesson /></T>} />
        <Route path="/teacher/record/mobile" element={<MobileRecordLesson />} />
        <Route path="/e/:environmentSlug/teacher/record/mobile" element={<MobileRecordLesson />} />
        <Route path="/teacher/lessons" element={<T><LessonList /></T>} />
        <Route path="/e/:environmentSlug/teacher/lessons" element={<T><LessonList /></T>} />
        <Route path="/teacher/lesson/:lessonId" element={<T><LessonProfile /></T>} />
        <Route path="/e/:environmentSlug/teacher/lesson/:lessonId" element={<T><LessonProfile /></T>} />
        <Route path="/teacher/student/:studentId" element={<T><StudentProfile /></T>} />
        <Route path="/e/:environmentSlug/teacher/student/:studentId" element={<T><StudentProfile /></T>} />

        {/* Panel ucznia */}
        <Route path="/student" element={<S><StudentDashboard /></S>} />
        <Route path="/e/:environmentSlug/student" element={<S><StudentDashboard /></S>} />
        <Route path="/student/lesson/:taskId" element={<S><LessonTasks /></S>} />
        <Route path="/e/:environmentSlug/student/lesson/:taskId" element={<S><LessonTasks /></S>} />
        <Route path="/student/note/:taskId" element={<S><NoteView /></S>} />
        <Route path="/e/:environmentSlug/student/note/:taskId" element={<S><NoteView /></S>} />
        <Route path="/student/material/:materialId" element={<S><MaterialView /></S>} />
        <Route path="/e/:environmentSlug/student/material/:materialId" element={<S><MaterialView /></S>} />
        <Route path="/student/profile" element={<S><MyProfile /></S>} />
        <Route path="/e/:environmentSlug/student/profile" element={<S><MyProfile /></S>} />

        <Route path="*" element={<EnvironmentRedirect to="/login" />} />
      </Routes>
      </AuthProvider>
    </EnvironmentProvider>
  )
}
