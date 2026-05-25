# EduFlow

EduFlow is an AI-assisted learning platform that turns a lesson into concrete follow-up work for students. A teacher can record a short lesson summary or upload a PDF, and the system helps generate learning materials, quizzes, feedback, and progress visibility for the class.

The project was built as a hackathon prototype focused on reducing the manual work teachers do after lessons: preparing notes, creating tasks, checking answers, and tracking whether students actually understood the topic.

## Live Demo

Production app:

https://eduflowapp.web.app

Repository:

https://github.com/bujaakk/eduflow

## What Problem Does EduFlow Solve?

After a lesson, teachers often do not have a fast way to know:

- which students understood the topic,
- which students need more practice,
- what should be repeated in the next lesson,
- how to create useful follow-up materials without spending extra hours after class.

Students also often lack immediate feedback. They may complete work, but they do not instantly know what was correct, what needs improvement, or where to review the lesson content.

EduFlow closes this loop by connecting the teacher, student, lesson content, and AI-generated support in one workflow.

## Core Idea

EduFlow follows a simple learning loop:

1. The teacher creates or records lesson content.
2. AI helps transform it into useful student materials.
3. The student completes tasks and receives feedback.
4. The teacher sees progress and can react faster.

The goal is not to replace the teacher. The goal is to give the teacher more time for actual teaching by reducing repetitive work after lessons.

## Main Features

### Teacher Panel

The teacher can:

- view assigned classes,
- manage students in a class,
- record a lesson summary,
- use a QR flow to record audio from a phone,
- review generated transcription before sending it for processing,
- view created lessons,
- inspect student progress,
- review lesson/task completion status.

### Mobile Recording via QR

If recording on the computer is inconvenient, the teacher can generate a QR code. The phone opens a mobile recording page where the teacher can record or upload audio. The desktop view receives the uploaded recording and continues the lesson processing flow.

This is useful in real classrooms where the teacher's laptop microphone may not be good enough or may not be available.

### Student Panel

The student can:

- see assigned lessons and their statuses,
- complete quiz-style lesson tasks,
- receive feedback after answering,
- unlock lesson notes after completing required work,
- view additional materials,
- check profile/progress information.

### Admin Panel

The admin panel is used to prepare the school structure:

- manage environments,
- create or manage users,
- assign roles,
- create teachers/students,
- connect users with classes.

The admin panel is supporting infrastructure. The primary product experience is the teacher-student learning flow.

### Multi-Environment Support

EduFlow supports environment-specific routing using paths such as:

```text
/e/:environmentSlug/login
/e/:environmentSlug/teacher
/e/:environmentSlug/student
```

This allows separate school or demo environments to exist inside the same app deployment.

## AI Features

EduFlow uses AI-assisted workflows through external webhook integrations. The exact model/workflow can be changed behind the webhook layer, but the product value stays the same: less manual work and faster feedback.

### 1. Lesson Audio Processing

Teacher audio is sent to an audio webhook. The workflow is designed to turn a recording into lesson content, including transcription and structured materials.

User value:

> No more manually writing notes after every lesson.

### 2. Quiz and Task Generation

Lesson content can be transformed into tasks for students. The teacher can use this as a starting point instead of creating exercises from scratch.

User value:

> One lesson summary becomes student work automatically.

### 3. Answer Evaluation

Student quiz answers can be evaluated automatically, allowing faster feedback and a smoother learning loop.

User value:

> Students get feedback immediately instead of waiting days.

### 4. Exercise Checking

The application is designed around AI-supported checking of student exercises and learning tasks.

User value:

> The teacher does not need to manually check every repetitive answer.

### 5. Lesson Chatbot

The product direction includes lesson-context help for students: instead of searching the open internet, the student can ask questions about the material connected to the lesson.

User value:

> Students can ask follow-up questions when the teacher is not next to them.

### 6. PDF to Learning Material

Teachers can upload a PDF and send it to a PDF material webhook. The workflow can produce student-friendly learning material from an existing document.

User value:

> Old PDFs become readable, structured learning materials.

### 7. Student Invitations

EduFlow includes invitation/onboarding flows for students. This helps teachers and admins start a class faster.

User value:

> A class can be onboarded without manual account setup for every student.

## Tech Stack

Frontend:

- React 18
- Vite
- React Router
- React Hook Form
- React Markdown
- Lucide React icons

Backend and infrastructure:

- Firebase Authentication
- Cloud Firestore
- Firebase Storage
- Firebase Hosting
- Firebase Cloud Functions for selected proxy flows

AI and automation integrations:

- n8n webhook workflows
- external AI/STT services behind webhook endpoints

Analytics:

- Amplitude Unified SDK, optional and controlled by environment variables

PWA:

- Vite PWA plugin
- generated service worker and manifest

## Project Structure

```text
EduFlow/
  functions/              Firebase Cloud Functions
  public/                 Public static assets and PWA icons
  scripts/                Utility scripts, including auto backup
  src/
    assets/               Design assets and typography
    components/           Shared UI components
    contexts/             Auth and environment contexts
    pages/                App pages grouped by role
      student/            Student dashboard, tasks, notes, materials, profile
      teacher/            Teacher dashboard, classes, recording, lessons, profiles
    services/             Webhook upload and analytics services
    utils/                Shared utility logic
  zadania/                Hackathon planning/task notes
```

## Important Routes

Public/auth routes:

```text
/login
/e/:environmentSlug/login
/admin
```

Teacher routes:

```text
/teacher
/teacher/class/:classId
/teacher/record
/teacher/record/mobile
/teacher/lessons
/teacher/lesson/:lessonId
/teacher/student/:studentId
```

Environment-prefixed teacher routes:

```text
/e/:environmentSlug/teacher
/e/:environmentSlug/teacher/class/:classId
/e/:environmentSlug/teacher/record
/e/:environmentSlug/teacher/record/mobile
/e/:environmentSlug/teacher/lessons
/e/:environmentSlug/teacher/lesson/:lessonId
/e/:environmentSlug/teacher/student/:studentId
```

Student routes:

```text
/student
/student/lesson/:taskId
/student/note/:taskId
/student/material/:materialId
/student/profile
```

Environment-prefixed student routes:

```text
/e/:environmentSlug/student
/e/:environmentSlug/student/lesson/:taskId
/e/:environmentSlug/student/note/:taskId
/e/:environmentSlug/student/material/:materialId
/e/:environmentSlug/student/profile
```

## Environment Variables

Create a local `.env` file based on `.env.example` if you need custom webhook or analytics configuration.

```env
VITE_AUDIO_WEBHOOK_URL=https://n8n.yourwayai.pl/webhook/eduflow-audio
VITE_AUDIO_WEBHOOK_SECRET=eduflow-secret-2026
VITE_AUDIO_WEBHOOK_TIMEOUT_MS=45000
VITE_AMPLITUDE_API_KEY=your_amplitude_api_key
VITE_AMPLITUDE_DASHBOARD_URL=
VITE_AMPLITUDE_EMBED_URL=
```

Additional optional analytics setting:

```env
VITE_AMPLITUDE_SESSION_REPLAY_SAMPLE_RATE=0
```

Session replay is disabled by default for demo stability and cleaner browser console output.

## Audio Upload Notes

Desktop recording uses `MediaRecorder`. For compatibility with STT/Whisper-style workflows, the app prefers `audio/mp4` when supported and normalizes WebM recordings to plain `audio/webm` instead of `audio/webm;codecs=opus`.

The audio webhook expects either:

- binary multipart data under the `data` field, or
- a remote `audioUrl` for mobile QR recordings.

This distinction is important for n8n workflows that read binary fields by name.

## PDF Material Upload Notes

PDF upload sends the original PDF file plus metadata to the PDF material webhook. The workflow receives class and teacher context and can create either a lesson-style material or additional student material.

## Getting Started Locally

### Prerequisites

- Node.js 18 or newer recommended
- npm
- Firebase project access if using live data/deploy

### Install Dependencies

```bash
npm install
```

### Run Development Server

```bash
npm run dev
```

### Build Production Bundle

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Firebase Deployment

The app is deployed to Firebase Hosting.

Typical deployment flow:

```bash
npm run build
firebase deploy --only hosting
```

Firebase configuration files included in the repository:

```text
firebase.json
firestore.rules
storage.rules
functions/package.json
functions/index.js
```

## Demo Flow

A strong 3-minute demo can follow this structure:

1. Problem: teachers lose time after lessons creating notes, tasks, and checking understanding.
2. User: teacher first, student second, parent as roadmap.
3. Solution: one lesson summary becomes student work and teacher insight.
4. AI value: less manual work, faster feedback, better follow-up.
5. Teacher demo: class dashboard, lesson recording, QR mobile recording, transcription approval.
6. Student demo: lesson list, task completion, feedback, unlocked notes.
7. Materials demo: PDF transformed into learning material.
8. Next steps: parent panel, mobile app, integrations with school systems, deeper analytics.

Sales-oriented messages for the demo:

- `No more manual notes after every lesson.`
- `Students get feedback immediately.`
- `Old PDFs become interactive learning materials.`
- `The teacher sees progress before the class moves on.`
- `AI does not replace the teacher. It gives the teacher time back.`

## Current Prototype Scope

EduFlow is a working hackathon prototype. The current app demonstrates:

- role-based auth,
- teacher and student dashboards,
- class/student management,
- lesson recording flow,
- mobile QR recording flow,
- AI webhook integration points,
- student task flow,
- material viewing,
- multi-environment routing,
- Firebase-backed persistence.

Some AI behavior depends on external n8n workflows and the availability/configuration of the connected AI services.

## Roadmap

Planned improvements after the hackathon:

- parent dashboard with student progress visibility,
- dedicated student mobile app,
- integrations with school systems such as Librus or Vulcan,
- deeper class analytics and recommendations,
- richer teacher editing tools for generated tasks and notes,
- stronger observability for AI workflow failures,
- automated end-to-end tests for the teacher-student demo path.

## Repository Status

Main branch:

```text
main
```

Remote:

```text
origin https://github.com/bujaakk/eduflow.git
```

## License

No explicit license has been added yet. Add one before public or commercial distribution.
