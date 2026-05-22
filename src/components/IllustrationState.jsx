import aiRecommendationsImg from '../assets/metric-ai-recommendations.png'
import completedLessonsImg from '../assets/metric-completed-lessons.png'
import errorImg from '../assets/state-error.png'
import inviteStudentsImg from '../assets/hero-invite-students.png'
import learningGapsImg from '../assets/metric-learning-gaps.png'
import noLessonsImg from '../assets/state-no-lessons.png'
import noStudentsImg from '../assets/state-no-students.png'
import noTasksImg from '../assets/state-no-tasks.png'
import studentActivityImg from '../assets/metric-student-activity.png'
import successImg from '../assets/state-success.png'
import voiceRecordingImg from '../assets/hero-voice-recording.png'

const images = {
  error: errorImg,
  noLessons: noLessonsImg,
  noStudents: noStudentsImg,
  noTasks: noTasksImg,
  success: successImg,
  inviteStudents: inviteStudentsImg,
  voiceRecording: voiceRecordingImg,
  completedLessons: completedLessonsImg,
  learningGaps: learningGapsImg,
  studentActivity: studentActivityImg,
  aiRecommendations: aiRecommendationsImg,
}

export default function IllustrationState({ type, title, text, action, compact = false }) {
  const src = images[type]

  return (
    <div className={`illustration-state ${compact ? 'illustration-state-compact' : ''}`}>
      {src && <img src={src} alt="" className="illustration-state-image" loading="lazy" />}
      <div className="illustration-state-copy">
        {title && <h3>{title}</h3>}
        {text && <p>{text}</p>}
        {action && <div className="illustration-state-action">{action}</div>}
      </div>
    </div>
  )
}
