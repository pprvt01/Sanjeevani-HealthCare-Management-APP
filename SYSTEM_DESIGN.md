# System Design Document: Healthcare Appointment & Follow-up Manager

## 1. Overview
The Healthcare Appointment & Follow-up Manager is a full-stack transactional platform designed to streamline doctor-patient interactions. It incorporates AI-driven pre-visit and post-visit clinical summaries, concurrent slot reservation guards, automated doctor leave conflict resolution, and asynchronous retryable notification queues.

---

## 2. Double-Booking Prevention & Concurrency Control
Concurrent booking attempts for the same time slot present race condition vulnerabilities. To prevent double-booking safely across simultaneous user requests, the system implements a multi-layered concurrency strategy:

1. **Database Transactions (`prisma.$transaction`)**: All slot availability checks and booking creations are executed inside an isolated database transaction.
2. **Unique Database Constraints**: A compound unique index `@@unique([doctorId, date, timeSlot, status])` is enforced at the schema layer on active `BOOKED` appointments. If two requests bypass application logic concurrently, the database engine enforces atomicity and rejects the secondary insert with a unique constraint violation exception (`P2002`).
3. **Pessimistic / Row-Level Lock Semantics**: On SQL engines (such as PostgreSQL), queries issue `SELECT FOR UPDATE` on the targeted doctor's schedule for the target date, serializing incoming booking requests before mutation.

---

## 3. Slot Hold Mechanism (5-Minute TTL)
To ensure patients have sufficient time to enter detailed symptoms without risking slot poaching, a temporary **Slot Hold Mechanism** is placed ahead of booking confirmation:

- **Hold Acquisition**: When a patient selects a time slot, a `SlotHold` entity is persisted with an explicit expiration timestamp (`expiresAt = NOW() + 5 minutes`).
- **Conflict Filtering**: Slot search queries check both `BOOKED` appointments and unexpired `SlotHold` records. If a slot is held by Patient A, it is flagged as unavailable to Patient B.
- **TTL Enforcement**: A background worker periodically purges expired holds (`expiresAt <= NOW()`). Additionally, attempts to book or re-hold check the expiration inline. If Patient A completes symptom submission within 5 minutes, the slot transitions atomically to `BOOKED` and the hold is released.

---

## 4. Doctor Leave Management & Auto-Cancellation Job
When an administrator registers a leave day for a doctor, existing patient appointments on that date must be handled reliably without manual intervention:

```
[Admin Marks Leave] ──► [Database Transaction]
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
       [Create Leave Record]      [Query BOOKED Appointments]
                                              │
                                              ▼
                                 [Batch Update to CANCELLED]
                                              │
                                              ▼
                             [Enqueue Async Jobs into Queue]
                                ├── EMAIL_CANCELLATION (Patient & Doctor)
                                └── GCAL_DELETE (Calendar Sync)
```

1. **Atomic Transaction**: The leave creation and appointment updates run within a single transaction to ensure consistency.
2. **Batch Status Mutation**: All `BOOKED` appointments for the specified `doctorId` and `date` are updated to `CANCELLED`.
3. **Asynchronous Job Dispatch**: A background job queries affected appointments and enqueues individual cancellation tasks for each patient into the persistent `NotificationQueue`. Affected patients receive automated cancellation emails informing them of the leave and prompting them to reschedule.

---

## 5. Notification Reliability & Failure Handling
External network dependencies (e.g., SMTP servers, Google Calendar OAuth APIs, and LLM APIs) can experience transient failures or rate limits.

### A. Message Queue & Exponential Backoff Retries
- **Persistent Queue**: Notifications are enqueued in `NotificationQueue` with status `PENDING`, `attempts: 0`, and `maxAttempts: 5`.
- **Worker Execution**: A background scheduler retrieves due jobs and attempts delivery.
- **Exponential Backoff**: If an email or Google Calendar API call fails, the job remains in the queue, and `nextAttemptAt` is rescheduled using exponential backoff:
  $$\text{Delay (ms)} = 2^{\text{attempts}} \times 1000$$
- **Dead Letter Handling**: If `attempts` reaches `maxAttempts` (5 attempts), the job status updates to `FAILED` with diagnostic logs captured in `lastError`.

### B. LLM Summary Failure Isolation
- **Try-Catch & Timeout Wrapper**: All calls to the Gemini LLM API are wrapped in a strict promise timeout (e.g., 5000ms) inside a try-catch block.
- **Graceful Fallback**: If the LLM times out, throws an error, or rate limits, the core transactional booking or clinical note saving **does not fail**. Raw symptoms or notes are saved to the database, and `preVisitSummary` / `postVisitSummary` defaults to `"Summary pending"`.
