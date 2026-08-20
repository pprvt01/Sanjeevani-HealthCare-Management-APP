import { QueueService } from '../services/queue.service';
import { prisma } from '../models/prisma';

export class BackgroundScheduler {
  private static intervalId: NodeJS.Timeout | null = null;

  static start(intervalMs = 10000) {
    if (this.intervalId) return;

    console.log(`[BACKGROUND SCHEDULER] Started background worker (Interval: ${intervalMs}ms)`);

    this.intervalId = setInterval(async () => {
      try {
        // 1. Process notification queue retries & emails
        const processed = await QueueService.processPendingJobs();
        if (processed > 0) {
          console.log(`[BACKGROUND SCHEDULER] Processed ${processed} notification job(s).`);
        }

        // 2. Clean up expired slot holds
        const now = new Date();
        const deletedHolds = await prisma.slotHold.deleteMany({
          where: { expiresAt: { lte: now } },
        });

        if (deletedHolds.count > 0) {
          console.log(`[BACKGROUND SCHEDULER] Cleaned up ${deletedHolds.count} expired slot hold(s).`);
        }
      } catch (err) {
        console.error('[BACKGROUND SCHEDULER] Error during cycle execution:', err);
      }
    }, intervalMs);
  }

  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[BACKGROUND SCHEDULER] Stopped background worker');
    }
  }
}
