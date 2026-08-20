import { prisma } from '../models/prisma';
import { EmailService } from './email.service';
import { GCalService } from './gcal.service';

export interface NotificationPayload {
  toEmail?: string;
  subject?: string;
  textMessage?: string;
  gcalEventId?: string;
  appointmentId?: string;
}

export class QueueService {
  /**
   * Enqueues a notification job into the NotificationQueue table
   */
  static async enqueueJob(type: string, payload: NotificationPayload, maxAttempts = 5): Promise<string> {
    const job = await prisma.notificationQueue.create({
      data: {
        type,
        payload: JSON.stringify(payload),
        status: 'PENDING',
        attempts: 0,
        maxAttempts,
        nextAttemptAt: new Date(),
      },
    });
    return job.id;
  }

  /**
   * Worker loop: Fetches due jobs and processes them with exponential backoff on failure
   */
  static async processPendingJobs(): Promise<number> {
    const now = new Date();

    const pendingJobs = await prisma.notificationQueue.findMany({
      where: {
        status: { in: ['PENDING', 'PROCESSING'] },
        nextAttemptAt: { lte: now },
        attempts: { lt: 5 },
      },
      take: 10,
    });

    let processedCount = 0;

    for (const job of pendingJobs) {
      try {
        await prisma.notificationQueue.update({
          where: { id: job.id },
          data: { status: 'PROCESSING' },
        });

        const payload: NotificationPayload = JSON.parse(job.payload);

        switch (job.type) {
          case 'EMAIL_CONFIRMATION':
          case 'EMAIL_CANCELLATION':
          case 'MEDICATION_REMINDER':
            if (payload.toEmail && payload.subject && payload.textMessage) {
              await EmailService.sendEmail(payload.toEmail, payload.subject, payload.textMessage);
            }
            break;

          case 'GCAL_DELETE':
            if (payload.gcalEventId) {
              await GCalService.deleteAppointmentEvent(payload.gcalEventId);
            }
            break;

          default:
            console.warn(`Unknown job type: ${job.type}`);
        }

        // Job completed successfully
        await prisma.notificationQueue.update({
          where: { id: job.id },
          data: {
            status: 'SENT',
            updatedAt: new Date(),
          },
        });

        processedCount++;
      } catch (error: any) {
        const attempts = job.attempts + 1;
        const errorMessage = error?.message || String(error);

        if (attempts >= job.maxAttempts) {
          await prisma.notificationQueue.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              attempts,
              lastError: errorMessage,
              updatedAt: new Date(),
            },
          });
          console.error(`[QUEUE WORKER] Job ${job.id} failed permanently after ${attempts} attempts.`);
        } else {
          // Exponential backoff calculation: 2^attempts * 1000ms
          const backoffDelayMs = Math.pow(2, attempts) * 1000;
          const nextAttemptAt = new Date(Date.now() + backoffDelayMs);

          await prisma.notificationQueue.update({
            where: { id: job.id },
            data: {
              status: 'PENDING',
              attempts,
              nextAttemptAt,
              lastError: errorMessage,
              updatedAt: new Date(),
            },
          });

          console.warn(`[QUEUE WORKER] Job ${job.id} failed (Attempt ${attempts}). Retrying in ${backoffDelayMs}ms at ${nextAttemptAt.toISOString()}`);
        }
      }
    }

    return processedCount;
  }
}
