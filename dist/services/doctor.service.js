"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoctorService = void 0;
const prisma_1 = require("../models/prisma");
const queue_service_1 = require("./queue.service");
class DoctorService {
    /**
     * Admin creates a doctor profile linked to a user account
     */
    static async createDoctorProfile(data) {
        return await prisma_1.prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    name: data.name,
                    email: data.email,
                    passwordHash: data.passwordHash,
                    role: 'DOCTOR',
                },
            });
            const doctor = await tx.doctor.create({
                data: {
                    userId: user.id,
                    specialization: data.specialization,
                    workingHoursStart: data.workingHoursStart || '09:00',
                    workingHoursEnd: data.workingHoursEnd || '17:00',
                    slotDuration: data.slotDuration || 30,
                },
                include: {
                    user: {
                        select: { id: true, name: true, email: true },
                    },
                },
            });
            return doctor;
        });
    }
    /**
     * Retrieves all doctors with optional specialization filter
     */
    static async getAllDoctors(specialization) {
        const whereClause = specialization
            ? { specialization: { contains: specialization } }
            : {};
        return await prisma_1.prisma.doctor.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { id: true, name: true, email: true },
                },
                leaves: true,
            },
        });
    }
    /**
     * Calculates available time slots for a doctor on a specific date (YYYY-MM-DD)
     * Checks doctor working hours, leaves, active BOOKED appointments, and active SlotHolds.
     */
    static async getAvailableSlots(doctorId, date) {
        const doctor = await prisma_1.prisma.doctor.findUnique({
            where: { id: doctorId },
            include: {
                user: { select: { name: true, email: true } },
                leaves: true,
            },
        });
        if (!doctor) {
            throw new Error('Doctor not found');
        }
        // Check if doctor is on leave for this date
        const isOnLeave = doctor.leaves.some((l) => l.date === date);
        if (isOnLeave) {
            return {
                doctor: { id: doctor.id, name: doctor.user.name, specialization: doctor.specialization },
                date,
                isOnLeave: true,
                availableSlots: [],
                message: 'Doctor is on leave on this date.',
            };
        }
        // Generate candidate slots based on working hours and slot duration
        const allSlots = this.generateTimeSlots(doctor.workingHoursStart, doctor.workingHoursEnd, doctor.slotDuration);
        // Fetch existing BOOKED appointments for this date
        const bookedAppointments = await prisma_1.prisma.appointment.findMany({
            where: {
                doctorId,
                date,
                status: 'BOOKED',
            },
            select: { timeSlot: true },
        });
        const bookedSlotSet = new Set(bookedAppointments.map((a) => a.timeSlot));
        // Fetch active unexpired slot holds
        const now = new Date();
        const activeSlotHolds = await prisma_1.prisma.slotHold.findMany({
            where: {
                doctorId,
                date,
                expiresAt: { gt: now },
            },
            select: { timeSlot: true, patientId: true, expiresAt: true },
        });
        const heldSlotSet = new Set(activeSlotHolds.map((h) => h.timeSlot));
        // Map each slot with availability status
        const slotDetails = allSlots.map((slot) => {
            const isBooked = bookedSlotSet.has(slot);
            const holdInfo = activeSlotHolds.find((h) => h.timeSlot === slot);
            const isHeld = Boolean(holdInfo);
            return {
                timeSlot: slot,
                available: !isBooked && !isHeld,
                isBooked,
                isHeld,
                heldUntil: holdInfo?.expiresAt || null,
            };
        });
        return {
            doctor: {
                id: doctor.id,
                name: doctor.user.name,
                specialization: doctor.specialization,
                workingHours: `${doctor.workingHoursStart} - ${doctor.workingHoursEnd}`,
                slotDuration: doctor.slotDuration,
            },
            date,
            isOnLeave: false,
            slots: slotDetails,
            availableSlots: slotDetails.filter((s) => s.available).map((s) => s.timeSlot),
        };
    }
    /**
     * Marks doctor on leave for a given date.
     * Requirement #2: When an admin marks a doctor on leave for a date with existing bookings,
     * affected patients must be notified. Trigger a background job that queries all appointments
     * for that date, updates status to 'Cancelled', and queues cancellation emails & GCal deletion.
     */
    static async addLeaveAndHandleConflicts(doctorId, date, reason) {
        return await prisma_1.prisma.$transaction(async (tx) => {
            const doctor = await tx.doctor.findUnique({
                where: { id: doctorId },
                include: { user: true },
            });
            if (!doctor) {
                throw new Error('Doctor not found');
            }
            // Check if leave already exists
            const existingLeave = await tx.leave.findUnique({
                where: { doctorId_date: { doctorId, date } },
            });
            if (!existingLeave) {
                await tx.leave.create({
                    data: {
                        doctorId,
                        date,
                        reason: reason || 'Scheduled Leave',
                    },
                });
            }
            // Query all BOOKED appointments for that date
            const affectedAppointments = await tx.appointment.findMany({
                where: {
                    doctorId,
                    date,
                    status: 'BOOKED',
                },
                include: {
                    patient: true,
                },
            });
            // Update statuses to CANCELLED
            for (const appt of affectedAppointments) {
                await tx.appointment.update({
                    where: { id: appt.id },
                    data: { status: 'CANCELLED' },
                });
                // Queue cancellation emails for patient
                await queue_service_1.QueueService.enqueueJob('EMAIL_CANCELLATION', {
                    toEmail: appt.patient.email,
                    subject: `Appointment Cancelled - Dr. ${doctor.user.name} on ${date}`,
                    textMessage: `Dear ${appt.patient.name},\n\nWe regret to inform you that your appointment with Dr. ${doctor.user.name} on ${date} at ${appt.timeSlot} has been cancelled because the doctor is on leave.\n\nPlease log in to reschedule your appointment at your earliest convenience.\n\nBest regards,\nHealthcare Clinic Team`,
                    appointmentId: appt.id,
                });
                // Queue cancellation email for doctor
                await queue_service_1.QueueService.enqueueJob('EMAIL_CANCELLATION', {
                    toEmail: doctor.user.email,
                    subject: `Leave Confirmed & Appointment Cancelled - ${date} at ${appt.timeSlot}`,
                    textMessage: `Dr. ${doctor.user.name},\n\nYour leave on ${date} has been recorded. Appointment with patient ${appt.patient.name} at ${appt.timeSlot} has been cancelled automatically.`,
                    appointmentId: appt.id,
                });
                // Queue GCal deletion if event exists
                if (appt.gcalEventId) {
                    await queue_service_1.QueueService.enqueueJob('GCAL_DELETE', {
                        gcalEventId: appt.gcalEventId,
                        appointmentId: appt.id,
                    });
                }
            }
            return {
                doctorId,
                date,
                cancelledAppointmentsCount: affectedAppointments.length,
                affectedPatients: affectedAppointments.map((a) => ({
                    appointmentId: a.id,
                    patientName: a.patient.name,
                    patientEmail: a.patient.email,
                    timeSlot: a.timeSlot,
                })),
            };
        });
    }
    /**
     * Helper to generate time slot strings (e.g., ["09:00", "09:30", "10:00", ...])
     */
    static generateTimeSlots(startTime, endTime, durationMinutes) {
        const slots = [];
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        let currentMinutes = startH * 60 + startM;
        const endMinutes = endH * 60 + endM;
        while (currentMinutes + durationMinutes <= endMinutes) {
            const h = Math.floor(currentMinutes / 60).toString().padStart(2, '0');
            const m = (currentMinutes % 60).toString().padStart(2, '0');
            slots.push(`${h}:${m}`);
            currentMinutes += durationMinutes;
        }
        return slots;
    }
}
exports.DoctorService = DoctorService;
