"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminController = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const doctor_service_1 = require("../services/doctor.service");
const prisma_1 = require("../models/prisma");
class AdminController {
    /**
     * Create doctor profile
     */
    static async createDoctor(req, res) {
        try {
            const { name, email, password, specialization, workingHoursStart, workingHoursEnd, slotDuration } = req.body;
            if (!name || !email || !password || !specialization) {
                return res.status(400).json({ error: 'Name, email, password, and specialization are required' });
            }
            const existingUser = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ error: 'User with this email already exists' });
            }
            const passwordHash = await bcrypt_1.default.hash(password, 10);
            const doctor = await doctor_service_1.DoctorService.createDoctorProfile({
                name,
                email,
                passwordHash,
                specialization,
                workingHoursStart,
                workingHoursEnd,
                slotDuration: slotDuration ? parseInt(slotDuration, 10) : 30,
            });
            return res.status(201).json({
                message: 'Doctor profile created successfully',
                doctor,
            });
        }
        catch (error) {
            console.error('Error creating doctor:', error);
            return res.status(500).json({ error: error.message || 'Failed to create doctor' });
        }
    }
    /**
     * List all doctors
     */
    static async listDoctors(req, res) {
        try {
            const doctors = await doctor_service_1.DoctorService.getAllDoctors();
            return res.json({ doctors });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Failed to list doctors' });
        }
    }
    /**
     * Mark doctor on leave & execute auto-cancellation job for conflicting appointments
     */
    static async setDoctorLeave(req, res) {
        try {
            const doctorId = req.params.id;
            const { date, reason } = req.body;
            if (!doctorId || !date) {
                return res.status(400).json({ error: 'Doctor ID and date (YYYY-MM-DD) are required' });
            }
            const result = await doctor_service_1.DoctorService.addLeaveAndHandleConflicts(doctorId, date, reason);
            return res.json({
                message: `Leave recorded for Dr. on ${date}. Auto-cancelled ${result.cancelledAppointmentsCount} conflicting appointment(s).`,
                result,
            });
        }
        catch (error) {
            console.error('Error setting doctor leave:', error);
            return res.status(400).json({ error: error.message || 'Failed to set doctor leave' });
        }
    }
    /**
     * List all appointments across the system
     */
    static async listAllAppointments(req, res) {
        try {
            const appointments = await prisma_1.prisma.appointment.findMany({
                include: {
                    patient: { select: { name: true, email: true } },
                    doctor: { include: { user: { select: { name: true, email: true } } } },
                },
                orderBy: [{ date: 'desc' }, { timeSlot: 'asc' }],
            });
            return res.json({ appointments });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Failed to fetch appointments' });
        }
    }
    /**
     * List notification queue items
     */
    static async listQueue(req, res) {
        try {
            const queue = await prisma_1.prisma.notificationQueue.findMany({
                orderBy: { createdAt: 'desc' },
                take: 50,
            });
            return res.json({ queue });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Failed to fetch queue' });
        }
    }
}
exports.AdminController = AdminController;
