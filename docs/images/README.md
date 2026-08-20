# Sanjeevani - Healthcare Appointment & Follow-up Manager

A full-stack healthcare appointment platform with separate portals for **Patients**, **Doctors**, and **Admins**. Features AI-driven pre-visit symptom analysis and post-visit patient summaries using Google Gemini, race-condition safe 5-minute slot holds, automated doctor leave conflict auto-cancellation, and asynchronous email & Google Calendar notifications.

---

## Application Screenshots & Visual Walkthrough

Below is a complete visual walkthrough of the platform workflows across patient onboarding, slot reservation, AI pre-visit assessment, Google Calendar event dispatch, and automated leave conflict notifications.

### 1. Authentication & Onboarding
Seamless role-based authentication with separate flows for user login and patient account registration.

| User Login & Demo Credentials | Patient Registration Portal |
| :---: | :---: |
| ![User Login](./docs/images/Screenshot%202026-08-20%20at%203.30.56%E2%80%AFPM.png) | ![Patient Registration](./docs/images/Screenshot%202026-08-20%20at%203.31.04%E2%80%AFPM.png) |
| *Sign-in portal displaying pre-configured demo logins for Admin, Doctor, and Patient roles.* | *Fast patient self-registration form capturing Name, Email, and Password.* |

---

### 2. Doctor Discovery & Slot Booking Engine
Patients search clinicians by specialization and pick available consultation windows with built-in concurrency controls.

| Doctor Directory & Specialization Filter | Dynamic Slot Grid & Concurrency State |
| :---: | :---: |
| ![Doctor Directory](./docs/images/Screenshot%202026-08-20%20at%203.32.05%E2%80%AFPM.png) | ![Slot Selection](./docs/images/Screenshot%202026-08-20%20at%203.32.15%E2%80%AFPM.png) |
| *Doctor roster listing working hours, slot durations, and direct booking triggers.* | *Real-time slot availability showing active slots and disabled booked intervals.* |

---

### 3. AI Pre-Visit Symptom Analysis (Google Gemini)
Patients submit their symptoms during the booking flow. The platform automatically triggers a Gemini LLM evaluation to generate structured clinical insights prior to consultation.

| Symptom Submission Modal | Patient Dashboard & AI Assessment Output |
| :---: | :---: |
| ![Symptom Modal](./docs/images/Screenshot%202026-08-20%20at%203.31.52%E2%80%AFPM.png) | ![Pre-Visit Summary](./docs/images/Screenshot%202026-08-20%20at%203.32.08%E2%80%AFPM.png) |
| *Interactive symptom intake modal with automated AI analysis hook.* | *Live appointment record showing Urgency Level (Medium), Chief Complaint, and Suggested Doctor Questions.* |

---

### 4. Asynchronous Notifications & Calendar Sync
Background workers deliver booking confirmations, Google Calendar event invites, and automated cancellation notices directly to patient and doctor inboxes.

| Google Calendar Event Invitation | Doctor New Booking & AI Notification | Doctor Leave Auto-Cancellation Alert |
| :---: | :---: | :---: |
| ![Calendar Invite](./docs/images/1235EF12-69EC-452F-880B-FB3F591F64D6.png) | ![Doctor Booking Email](./docs/images/9035BED5-3741-4F42-8116-A72D94A3196B.png) | ![Leave Cancellation Email](./docs/images/9595F048-89DC-4462-A193-BD0A0D760CA7.png) |
| *Automated Google Calendar event created via OAuth 2.0 with start/end time syncing.* | *Asynchronous doctor notification containing patient symptoms and the AI Pre-Visit summary.* | *Automated conflict handling alerting doctor and patient when a leave date cancels booked slots.* |

---

## Key Features

1. **Role-Based Portals (Patient, Doctor, Admin)**:
   - **Patient Portal**: Search doctors by specialization, reserve slots with a 5-minute countdown hold, submit symptom forms, view AI pre-visit summaries, and access post-visit clinical notes with prescription schedules.
   - **Doctor Portal**: View upcoming patient schedules, inspect AI pre-visit symptom summaries before consultations, submit post-visit clinical notes, and auto-generate patient-friendly summaries with medication reminders.
   - **Admin Portal**: Create & manage doctor profiles (working hours, slot durations), mark doctor leave days (which automatically cancels conflicting bookings and notifies patients), and monitor the asynchronous notification queue.

2. **Concurrency & Double-Booking Prevention**:
   - **5-Minute Slot Hold TTL**: Temporary hold mechanism so patients can fill symptom forms without losing their slot.
   - **Atomic Transactions & Unique Constraints**: Database row locking and unique constraints `(doctorId, date, timeSlot, status)` prevent double booking race conditions.

3. **AI Integration (Google Gemini)**:
   - **Pre-Visit Prompt**: `"Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"`
   - **Post-Visit Prompt**: `"Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"`
   - **Graceful Failure Handling**: LLM calls are wrapped in a 5-second timeout with try-catch fallback[cite: 1]. If Gemini times out or fails, the raw symptoms/notes are saved and `"Summary pending"` is displayed, ensuring the booking or consultation completion succeeds smoothly[cite: 1]!

4. **Asynchronous Notification Queue**:
   - Handles email notifications (Confirmation, Cancellation, Medication Reminders) and Google Calendar OAuth event creation/deletion asynchronously with exponential backoff retries ($2^{\text{attempts}} \times 1000\text{ms}$)[cite: 1].

---

## Quick Setup Guide

### 1. Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### 2. Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure Environment Variables
cp .env.example .env

# 3. Initialize & Sync Database Schema (Prisma with SQLite/Postgres)
npm run prisma:db

# 4. Generate Prisma Client
npm run prisma:generate

# 5. Populate Mock Data (Seed Script with Faker)
npm run seed