import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { DoctorService } from '../services/doctor.service';
import { prisma } from '../models/prisma';

export class AdminController {
  /**
   * Create doctor profile
   */
  static async createDoctor(req: Request, res: Response) {
    try {
      const { name, email, password, specialization, workingHoursStart, workingHoursEnd, slotDuration } = req.body;

      if (!name || !email || !password || !specialization) {
        return res.status(400).json({ error: 'Name, email, password, and specialization are required' });
      }

      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const doctor = await DoctorService.createDoctorProfile({
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
    } catch (error: any) {
      console.error('Error creating doctor:', error);
      return res.status(500).json({ error: error.message || 'Failed to create doctor' });
    }
  }

  /**
   * List all doctors
   */
  static async listDoctors(req: Request, res: Response) {
    try {
      const doctors = await DoctorService.getAllDoctors();
      return res.json({ doctors });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to list doctors' });
    }
  }

  /**
   * Mark doctor on leave & execute auto-cancellation job for conflicting appointments
   */
  static async setDoctorLeave(req: Request, res: Response) {
    try {
      const doctorId = req.params.id as string;
      const { date, reason } = req.body;

      if (!doctorId || !date) {
        return res.status(400).json({ error: 'Doctor ID and date (YYYY-MM-DD) are required' });
      }

      const result = await DoctorService.addLeaveAndHandleConflicts(doctorId, date, reason);
      return res.json({
        message: `Leave recorded for Dr. on ${date}. Auto-cancelled ${result.cancelledAppointmentsCount} conflicting appointment(s).`,
        result,
      });
    } catch (error: any) {
      console.error('Error setting doctor leave:', error);
      return res.status(400).json({ error: error.message || 'Failed to set doctor leave' });
    }
  }

  /**
   * List all appointments across the system
   */
  static async listAllAppointments(req: Request, res: Response) {
    try {
      const appointments = await prisma.appointment.findMany({
        include: {
          patient: { select: { name: true, email: true } },
          doctor: { include: { user: { select: { name: true, email: true } } } },
        },
        orderBy: [{ date: 'desc' }, { timeSlot: 'asc' }],
      });

      return res.json({ appointments });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch appointments' });
    }
  }

  /**
   * List notification queue items
   */
  static async listQueue(req: Request, res: Response) {
    try {
      const queue = await prisma.notificationQueue.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return res.json({ queue });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch queue' });
    }
  }
}
