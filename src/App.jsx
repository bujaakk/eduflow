import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import PrivateRoute from './components/PrivateRoute'
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

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />

        {/* Panel nauczyciela */}
        <Route path="/teacher" element={<T><TeacherDashboard /></T>} />
        <Route path="/teacher/class/:classId" element={<T><ClassView /></T>} />
        <Route path="/teacher/record" element={<T><RecordLesson /></T>} />
        <Route path="/teacher/record/mobile" element={<MobileRecordLesson />} />
        <Route path="/teacher/lessons" element={<T><LessonList /></T>} />
        <Route path="/teacher/lesson/:lessonId" element={<T><LessonProfile /></T>} />
        <Route path="/teacher/student/:studentId" element={<T><StudentProfile /></T>} />

        {/* Panel ucznia */}
        <Route path="/student" element={<S><StudentDashboard /></S>} />
        <Route path="/student/lesson/:taskId" element={<S><LessonTasks /></S>} />
        <Route path="/student/note/:taskId" element={<S><NoteView /></S>} />
        <Route path="/student/material/:materialId" element={<S><MaterialView /></S>} />
        <Route path="/student/profile" element={<S><MyProfile /></S>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  )
}
