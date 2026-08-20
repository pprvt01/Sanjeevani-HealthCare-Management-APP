"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoctorService = void 0;
const prisma_1 = require("../models/prisma");
const queue_service_1 = require("./queue.service");
const format_1 = require("../utils/format");
class DoctorService {
    /**
     * Admin creates a doctor profile linked to a user account
     */
    static async createDoctorProfile(data) {
        return await prisma_1.prisma.$transaction(async (tx) => {
            // Strip any accidental Dr. prefix provided during creation
            const cleanName = data.name.replace(/^(Dr\.\s*)+/gi, '').trim();
            const user = await tx.user.create({
                data: {
                    name: cleanName,
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
        const doctors = await prisma_1.prisma.doctor.findMany({
            where: whereClause,
            include: {
                user: {
                    select: { id: true, name: true, email: true },
                },
                leaves: true,
            },
        });
        return doctors.map((doc) => ({
            ...doc,
            user: {
                ...doc.user,
                name: (0, format_1.formatDoctorName)(doc.user.name),
            },
        }));
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
        const docFormattedName = (0, format_1.formatDoctorName)(doctor.user.name);
        // Check if doctor is on leave for this date
        const isOnLeave = doctor.leaves.some((l) => l.date === date);
        if (isOnLeave) {
            return {
                doctor: { id: doctor.id, name: docFormattedName, specialization: doctor.specialization },
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
                name: docFormattedName,
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
        const jobsToEnqueue = [];
        const result = await prisma_1.prisma.$transaction(async (tx) => {
            const doctor = await tx.doctor.findUnique({
                where: { id: doctorId },
                include: { user: true },
            });
            if (!doctor) {
                throw new Error('Doctor not found');
            }
            const docFormattedName = (0, format_1.formatDoctorName)(doctor.user.name);
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
                // Prepare cancellation email for patient
                jobsToEnqueue.push({
                    type: 'EMAIL_CANCELLATION',
                    payload: {
                        toEmail: appt.patient.email,
                        subject: `Appointment Cancelled - ${docFormattedName} on ${date}`,
                        textMessage: `Dear ${appt.patient.name},\n\nWe regret to inform you that your appointment with ${docFormattedName} on ${date} at ${appt.timeSlot} has been cancelled because the doctor is on leave.\n\nPlease log in to reschedule your appointment at your earliest convenience.\n\nBest regards,\nSanjeevani Team`,
                        appointmentId: appt.id,
                    },
                });
                // Prepare cancellation email for doctor
                jobsToEnqueue.push({
                    type: 'EMAIL_CANCELLATION',
                    payload: {
                        toEmail: doctor.user.email,
                        subject: `Leave Confirmed & Appointment Cancelled - ${date} at ${appt.timeSlot}`,
                        textMessage: `${docFormattedName},\n\nYour leave on ${date} has been recorded. Appointment with patient ${appt.patient.name} at ${appt.timeSlot} has been cancelled automatically.`,
                        appointmentId: appt.id,
                    },
                });
                // Prepare GCal deletion if event exists
                if (appt.gcalEventId) {
                    jobsToEnqueue.push({
                        type: 'GCAL_DELETE',
                        payload: {
                            gcalEventId: appt.gcalEventId,
                            appointmentId: appt.id,
                        },
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
        }, { maxWait: 10000, timeout: 15000 });
        // Enqueue jobs asynchronously after transaction commit
        for (const job of jobsToEnqueue) {
            await queue_service_1.QueueService.enqueueJob(job.type, job.payload);
        }
        return result;
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
