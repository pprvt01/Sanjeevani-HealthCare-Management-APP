"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BookingService = void 0;
const prisma_1 = require("../models/prisma");
const llm_service_1 = require("./llm.service");
const gcal_service_1 = require("./gcal.service");
const queue_service_1 = require("./queue.service");
const config_1 = require("../config");
class BookingService {
    /**
     * Places a 5-minute temporary hold on a time slot for a patient.
     */
    static async holdSlot(patientId, doctorId, date, timeSlot) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + config_1.CONFIG.SLOT_HOLD_TTL_MINUTES * 60 * 1000);
        return await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Verify doctor exists and is not on leave
            const leave = await tx.leave.findUnique({
                where: { doctorId_date: { doctorId, date } },
            });
            if (leave) {
                throw new Error('Doctor is on leave on this date.');
            }
            // 2. Check if already booked
            const existingAppointment = await tx.appointment.findFirst({
                where: {
                    doctorId,
                    date,
                    timeSlot,
                    status: 'BOOKED',
                },
            });
            if (existingAppointment) {
                throw new Error('This slot has already been booked.');
            }
            // 3. Check existing holds by other patients
            const existingHold = await tx.slotHold.findUnique({
                where: { doctorId_date_timeSlot: { doctorId, date, timeSlot } },
            });
            if (existingHold && existingHold.expiresAt > now && existingHold.patientId !== patientId) {
                throw new Error('This slot is currently held by another patient. Please select another slot or wait.');
            }
            // 4. Create or update hold for this patient
            const slotHold = await tx.slotHold.upsert({
                where: { doctorId_date_timeSlot: { doctorId, date, timeSlot } },
                create: {
                    doctorId,
                    date,
                    timeSlot,
                    patientId,
                    expiresAt,
                },
                update: {
                    patientId,
                    expiresAt,
                },
            });
            return {
                holdId: slotHold.id,
                doctorId,
                date,
                timeSlot,
                expiresAt: slotHold.expiresAt,
                ttlSeconds: Math.floor((slotHold.expiresAt.getTime() - now.getTime()) / 1000),
            };
        });
    }
    /**
     * Confirms appointment booking safely with double-booking prevention.
     * Generates AI pre-visit summary, syncs GCal, and enqueues confirmation emails.
     */
    static async confirmBooking(patientId, doctorId, date, timeSlot, symptoms) {
        const now = new Date();
        // Perform booking in an isolated transaction to prevent double booking race conditions
        const appointment = await prisma_1.prisma.$transaction(async (tx) => {
            // 1. Check leave status
            const leave = await tx.leave.findUnique({
                where: { doctorId_date: { doctorId, date } },
            });
            if (leave) {
                throw new Error('Cannot book: Doctor is on leave on this date.');
            }
            // 2. Race Condition Protection: Check existing booked appointment
            const existingBooked = await tx.appointment.findFirst({
                where: {
                    doctorId,
                    date,
                    timeSlot,
                    status: 'BOOKED',
                },
            });
            if (existingBooked) {
                throw new Error('Slot conflict: This slot was just booked by another patient.');
            }
            // 3. Verify slot hold belongs to this patient if active
            const hold = await tx.slotHold.findUnique({
                where: { doctorId_date_timeSlot: { doctorId, date, timeSlot } },
            });
            if (hold && hold.expiresAt > now && hold.patientId !== patientId) {
                throw new Error('Slot conflict: Slot is reserved by another user.');
            }
            // 4. Create appointment record
            const appt = await tx.appointment.create({
                data: {
                    patientId,
                    doctorId,
                    date,
                    timeSlot,
                    symptoms,
                    status: 'BOOKED',
                    preVisitSummary: 'Summary pending', // Initial state
                },
                include: {
                    patient: true,
                    doctor: {
                        include: { user: true },
                    },
                },
            });
            // 5. Clear slot hold
            if (hold) {
                await tx.slotHold.delete({
                    where: { id: hold.id },
                });
            }
            return appt;
        });
        // 6. LLM Pre-Visit Summary Generation with Timeout & Fallback ("Summary pending")
        let preVisitSummary = 'Summary pending';
        try {
            preVisitSummary = await llm_service_1.LLMService.generatePreVisitSummary(symptoms);
            await prisma_1.prisma.appointment.update({
                where: { id: appointment.id },
                data: { preVisitSummary },
            });
        }
        catch (err) {
            console.warn(`Pre-visit LLM summary generation failed for appointment ${appointment.id}, using fallback:`, err);
        }
        // 7. Sync Google Calendar Event
        let gcalEventId = null;
        try {
            gcalEventId = await gcal_service_1.GCalService.createAppointmentEvent({
                patientEmail: appointment.patient.email,
                doctorEmail: appointment.doctor.user.email,
                doctorName: appointment.doctor.user.name,
                date: appointment.date,
                timeSlot: appointment.timeSlot,
                slotDurationMinutes: appointment.doctor.slotDuration,
                symptoms: appointment.symptoms,
            });
            await prisma_1.prisma.appointment.update({
                where: { id: appointment.id },
                data: { gcalEventId },
            });
        }
        catch (gcalErr) {
            console.warn('GCal creation error:', gcalErr);
        }
        // 8. Queue confirmation email to Patient
        await queue_service_1.QueueService.enqueueJob('EMAIL_CONFIRMATION', {
            toEmail: appointment.patient.email,
            subject: `Booking Confirmed with Dr. ${appointment.doctor.user.name}`,
            textMessage: `Dear ${appointment.patient.name},\n\nYour appointment with Dr. ${appointment.doctor.user.name} (${appointment.doctor.specialization}) on ${appointment.date} at ${appointment.timeSlot} has been successfully confirmed.\n\nReported Symptoms: ${symptoms}\nAI Symptom Assessment: ${preVisitSummary}\n\nThank you for choosing Healthcare Clinic!`,
            appointmentId: appointment.id,
        });
        // 9. Queue notification email to Doctor
        await queue_service_1.QueueService.enqueueJob('EMAIL_CONFIRMATION', {
            toEmail: appointment.doctor.user.email,
            subject: `New Appointment: ${appointment.patient.name} on ${appointment.date} at ${appointment.timeSlot}`,
            textMessage: `Dr. ${appointment.doctor.user.name},\n\nYou have a new booking with patient ${appointment.patient.name} on ${appointment.date} at ${appointment.timeSlot}.\n\nPatient Symptoms: ${symptoms}\nPre-Visit AI Summary:\n${preVisitSummary}`,
            appointmentId: appointment.id,
        });
        return {
            appointmentId: appointment.id,
            patientName: appointment.patient.name,
            doctorName: appointment.doctor.user.name,
            specialization: appointment.doctor.specialization,
            date: appointment.date,
            timeSlot: appointment.timeSlot,
            status: appointment.status,
            symptoms: appointment.symptoms,
            preVisitSummary,
            gcalEventId,
        };
    }
}
exports.BookingService = BookingService;
