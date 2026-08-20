import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../models/prisma';
import { LLMService } from '../services/llm.service';
import { QueueService } from '../services/queue.service';

export class DoctorController {
  /**
   * Fetch doctor's schedule / appointments
   */
  static async getSchedule(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const doctor = await prisma.doctor.findUnique({ where: { userId } });

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor profile not found' });
      }

      const appointments = await prisma.appointment.findMany({
        where: { doctorId: doctor.id },
        include: {
          patient: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
      });

      return res.json({ doctor, appointments });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch doctor schedule' });
    }
  }

  /**
   * Submit clinical notes & prescription for an appointment.
   * Triggers LLM Post-visit summary generation with timeout & fallback.
   */
  static async submitClinicalNotes(req: AuthRequest, res: Response) {
    try {
      const appointmentId = req.params.id as string;
      const { clinicalNotes, sendMedicationReminder } = req.body;

      if (!clinicalNotes) {
        return res.status(400).json({ error: 'clinicalNotes is required' });
      }

      const userId = req.user!.id;
      const doctor = await prisma.doctor.findUnique({
        where: { userId },
        include: { user: true },
      });

      if (!doctor) {
        return res.status(404).json({ error: 'Doctor profile not found' });
      }

      const appointment = await prisma.appointment.findFirst({
        where: { id: appointmentId, doctorId: doctor.id },
        include: { patient: true },
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found or not assigned to doctor' });
      }

      // Generate AI post-visit summary with graceful timeout handling
      let postVisitSummary = 'Summary pending';
      try {
        postVisitSummary = await LLMService.generatePostVisitSummary(clinicalNotes);
      } catch (err) {
        console.warn(`Post-visit summary generation failed for appointment ${appointmentId}, fallback applied:`, err);
      }

      // Update appointment status to COMPLETED with clinical notes & postVisitSummary
      const updatedAppointment = await prisma.appointment.update({
        where: { id: appointmentId },
        data: {
          clinicalNotes,
          postVisitSummary,
          status: 'COMPLETED',
        },
      });

      // Queue email to patient with the post-visit summary
      await QueueService.enqueueJob('EMAIL_CONFIRMATION', {
        toEmail: appointment.patient.email,
        subject: `Post-Visit Summary & Consultation Notes from Dr. ${doctor.user.name}`,
        textMessage: `Dear ${appointment.patient.name},\n\nThank you for visiting Dr. ${doctor.user.name} on ${appointment.date}.\n\nBelow is your patient-friendly summary:\n\n${postVisitSummary}\n\nClinical Notes:\n${clinicalNotes}\n\nStay safe and healthy!`,
        appointmentId: appointment.id,
      });

      // If doctor enabled medication reminder flag, queue reminder job
      if (sendMedicationReminder) {
        await QueueService.enqueueJob('MEDICATION_REMINDER', {
          toEmail: appointment.patient.email,
          subject: `Medication Reminder - Dr. ${doctor.user.name}`,
          textMessage: `Dear ${appointment.patient.name},\n\nThis is a friendly reminder to follow your prescribed medication schedule from Dr. ${doctor.user.name}.\n\nSummary:\n${postVisitSummary}`,
          appointmentId: appointment.id,
        });
      }

      return res.json({
        message: 'Clinical notes submitted successfully',
        appointment: updatedAppointment,
      });
    } catch (error: any) {
      console.error('Failed to submit clinical notes:', error);
      return res.status(500).json({ error: error.message || 'Failed to submit clinical notes' });
    }
  }
}
