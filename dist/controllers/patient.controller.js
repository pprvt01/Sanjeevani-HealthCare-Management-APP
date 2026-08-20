"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PatientController = void 0;
const doctor_service_1 = require("../services/doctor.service");
const booking_service_1 = require("../services/booking.service");
const prisma_1 = require("../models/prisma");
class PatientController {
    static async getDoctors(req, res) {
        try {
            const specialization = req.query.specialization;
            const doctors = await doctor_service_1.DoctorService.getAllDoctors(specialization);
            return res.json({ doctors });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Failed to fetch doctors' });
        }
    }
    static async getDoctorSlots(req, res) {
        try {
            const doctorId = req.params.id;
            const date = req.query.date || new Date().toISOString().split('T')[0];
            if (!doctorId) {
                return res.status(400).json({ error: 'Doctor ID is required' });
            }
            const result = await doctor_service_1.DoctorService.getAvailableSlots(doctorId, date);
            return res.json(result);
        }
        catch (error) {
            return res.status(400).json({ error: error.message || 'Failed to fetch slot availability' });
        }
    }
    static async holdSlot(req, res) {
        try {
            const patientId = req.user.id;
            const { doctorId, date, timeSlot } = req.body;
            if (!doctorId || !date || !timeSlot) {
                return res.status(400).json({ error: 'doctorId, date, and timeSlot are required' });
            }
            const result = await booking_service_1.BookingService.holdSlot(patientId, doctorId, date, timeSlot);
            return res.json({
                message: 'Slot successfully placed on 5-minute hold. Please complete symptom form.',
                hold: result,
            });
        }
        catch (error) {
            return res.status(400).json({ error: error.message || 'Could not hold slot' });
        }
    }
    static async bookAppointment(req, res) {
        try {
            const patientId = req.user.id;
            const { doctorId, date, timeSlot, symptoms } = req.body;
            if (!doctorId || !date || !timeSlot || !symptoms) {
                return res.status(400).json({ error: 'doctorId, date, timeSlot, and symptoms are required' });
            }
            const result = await booking_service_1.BookingService.confirmBooking(patientId, doctorId, date, timeSlot, symptoms);
            return res.status(201).json({
                message: 'Appointment successfully booked!',
                appointment: result,
            });
        }
        catch (error) {
            console.error('Booking confirmation failed:', error);
            return res.status(400).json({ error: error.message || 'Failed to book appointment' });
        }
    }
    static async getAppointments(req, res) {
        try {
            const patientId = req.user.id;
            const appointments = await prisma_1.prisma.appointment.findMany({
                where: { patientId },
                include: {
                    doctor: {
                        include: { user: { select: { name: true, email: true } } },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
            return res.json({ appointments });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Failed to fetch appointments' });
        }
    }
}
exports.PatientController = PatientController;
