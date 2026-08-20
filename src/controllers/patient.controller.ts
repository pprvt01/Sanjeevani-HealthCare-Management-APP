import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { DoctorService } from '../services/doctor.service';
import { BookingService } from '../services/booking.service';
import { prisma } from '../models/prisma';

export class PatientController {
  static async getDoctors(req: AuthRequest, res: Response) {
    try {
      const specialization = req.query.specialization as string;
      const doctors = await DoctorService.getAllDoctors(specialization);
      return res.json({ doctors });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch doctors' });
    }
  }

  static async getDoctorSlots(req: AuthRequest, res: Response) {
    try {
      const doctorId = req.params.id as string;
      const date = (req.query.date as string) || new Date().toISOString().split('T')[0];

      if (!doctorId) {
        return res.status(400).json({ error: 'Doctor ID is required' });
      }

      const result = await DoctorService.getAvailableSlots(doctorId, date);
      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to fetch slot availability' });
    }
  }

  static async holdSlot(req: AuthRequest, res: Response) {
    try {
      const patientId = req.user!.id;
      const { doctorId, date, timeSlot } = req.body;

      if (!doctorId || !date || !timeSlot) {
        return res.status(400).json({ error: 'doctorId, date, and timeSlot are required' });
      }

      const result = await BookingService.holdSlot(patientId, doctorId, date, timeSlot);
      return res.json({
        message: 'Slot successfully placed on 5-minute hold. Please complete symptom form.',
        hold: result,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Could not hold slot' });
    }
  }

  static async bookAppointment(req: AuthRequest, res: Response) {
    try {
      const patientId = req.user!.id;
      const { doctorId, date, timeSlot, symptoms } = req.body;

      if (!doctorId || !date || !timeSlot || !symptoms) {
        return res.status(400).json({ error: 'doctorId, date, timeSlot, and symptoms are required' });
      }

      const result = await BookingService.confirmBooking(patientId, doctorId, date, timeSlot, symptoms);
      return res.status(201).json({
        message: 'Appointment successfully booked!',
        appointment: result,
      });
    } catch (error: any) {
      console.error('Booking confirmation failed:', error);
      return res.status(400).json({ error: error.message || 'Failed to book appointment' });
    }
  }

  static async getAppointments(req: AuthRequest, res: Response) {
    try {
      const patientId = req.user!.id;
      const appointments = await prisma.appointment.findMany({
        where: { patientId },
        include: {
          doctor: {
            include: { user: { select: { name: true, email: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      return res.json({ appointments });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || 'Failed to fetch appointments' });
    }
  }
}
