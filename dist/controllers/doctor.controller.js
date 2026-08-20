"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoctorController = void 0;
const prisma_1 = require("../models/prisma");
const llm_service_1 = require("../services/llm.service");
const queue_service_1 = require("../services/queue.service");
class DoctorController {
    /**
     * Fetch doctor's schedule / appointments
     */
    static async getSchedule(req, res) {
        try {
            const userId = req.user.id;
            const doctor = await prisma_1.prisma.doctor.findUnique({ where: { userId } });
            if (!doctor) {
                return res.status(404).json({ error: 'Doctor profile not found' });
            }
            const appointments = await prisma_1.prisma.appointment.findMany({
                where: { doctorId: doctor.id },
                include: {
                    patient: {
                        select: { id: true, name: true, email: true },
                    },
                },
                orderBy: [{ date: 'asc' }, { timeSlot: 'asc' }],
            });
            return res.json({ doctor, appointments });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Failed to fetch doctor schedule' });
        }
    }
    /**
     * Submit clinical notes & prescription for an appointment.
     * Triggers LLM Post-visit summary generation with timeout & fallback.
     */
    static async submitClinicalNotes(req, res) {
        try {
            const appointmentId = req.params.id;
            const { clinicalNotes, sendMedicationReminder } = req.body;
            if (!clinicalNotes) {
                return res.status(400).json({ error: 'clinicalNotes is required' });
            }
            const userId = req.user.id;
            const doctor = await prisma_1.prisma.doctor.findUnique({
                where: { userId },
                include: { user: true },
            });
            if (!doctor) {
                return res.status(404).json({ error: 'Doctor profile not found' });
            }
            const appointment = await prisma_1.prisma.appointment.findFirst({
                where: { id: appointmentId, doctorId: doctor.id },
                include: { patient: true },
            });
            if (!appointment) {
                return res.status(404).json({ error: 'Appointment not found or not assigned to doctor' });
            }
            // Generate AI post-visit summary with graceful timeout handling
            let postVisitSummary = 'Summary pending';
            try {
                postVisitSummary = await llm_service_1.LLMService.generatePostVisitSummary(clinicalNotes);
            }
            catch (err) {
                console.warn(`Post-visit summary generation failed for appointment ${appointmentId}, fallback applied:`, err);
            }
            // Update appointment status to COMPLETED with clinical notes & postVisitSummary
            const updatedAppointment = await prisma_1.prisma.appointment.update({
                where: { id: appointmentId },
                data: {
                    clinicalNotes,
                    postVisitSummary,
                    status: 'COMPLETED',
                },
            });
            // Queue email to patient with the post-visit summary
            await queue_service_1.QueueService.enqueueJob('EMAIL_CONFIRMATION', {
                toEmail: appointment.patient.email,
                subject: `Post-Visit Summary & Consultation Notes from Dr. ${doctor.user.name}`,
                textMessage: `Dear ${appointment.patient.name},\n\nThank you for visiting Dr. ${doctor.user.name} on ${appointment.date}.\n\nBelow is your patient-friendly summary:\n\n${postVisitSummary}\n\nClinical Notes:\n${clinicalNotes}\n\nStay safe and healthy!`,
                appointmentId: appointment.id,
            });
            // If doctor enabled medication reminder flag, queue reminder job
            if (sendMedicationReminder) {
                await queue_service_1.QueueService.enqueueJob('MEDICATION_REMINDER', {
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
        }
        catch (error) {
            console.error('Failed to submit clinical notes:', error);
            return res.status(500).json({ error: error.message || 'Failed to submit clinical notes' });
        }
    }
}
exports.DoctorController = DoctorController;
