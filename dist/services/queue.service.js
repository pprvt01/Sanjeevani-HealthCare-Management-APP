"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueService = void 0;
const prisma_1 = require("../models/prisma");
const email_service_1 = require("./email.service");
const gcal_service_1 = require("./gcal.service");
class QueueService {
    /**
     * Enqueues a notification job into the NotificationQueue table
     */
    static async enqueueJob(type, payload, maxAttempts = 5) {
        const job = await prisma_1.prisma.notificationQueue.create({
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
    static async processPendingJobs() {
        const now = new Date();
        const pendingJobs = await prisma_1.prisma.notificationQueue.findMany({
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
                await prisma_1.prisma.notificationQueue.update({
                    where: { id: job.id },
                    data: { status: 'PROCESSING' },
                });
                const payload = JSON.parse(job.payload);
                switch (job.type) {
                    case 'EMAIL_CONFIRMATION':
                    case 'EMAIL_CANCELLATION':
                    case 'MEDICATION_REMINDER':
                        if (payload.toEmail && payload.subject && payload.textMessage) {
                            await email_service_1.EmailService.sendEmail(payload.toEmail, payload.subject, payload.textMessage);
                        }
                        break;
                    case 'GCAL_DELETE':
                        if (payload.gcalEventId) {
                            await gcal_service_1.GCalService.deleteAppointmentEvent(payload.gcalEventId);
                        }
                        break;
                    default:
                        console.warn(`Unknown job type: ${job.type}`);
                }
                // Job completed successfully
                await prisma_1.prisma.notificationQueue.update({
                    where: { id: job.id },
                    data: {
                        status: 'SENT',
                        updatedAt: new Date(),
                    },
                });
                processedCount++;
            }
            catch (error) {
                const attempts = job.attempts + 1;
                const errorMessage = error?.message || String(error);
                if (attempts >= job.maxAttempts) {
                    await prisma_1.prisma.notificationQueue.update({
                        where: { id: job.id },
                        data: {
                            status: 'FAILED',
                            attempts,
                            lastError: errorMessage,
                            updatedAt: new Date(),
                        },
                    });
                    console.error(`[QUEUE WORKER] Job ${job.id} failed permanently after ${attempts} attempts.`);
                }
                else {
                    // Exponential backoff calculation: 2^attempts * 1000ms
                    const backoffDelayMs = Math.pow(2, attempts) * 1000;
                    const nextAttemptAt = new Date(Date.now() + backoffDelayMs);
                    await prisma_1.prisma.notificationQueue.update({
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
exports.QueueService = QueueService;
