import { Router } from 'express';
import { PatientController } from '../controllers/patient.controller';
import { authenticateJWT, requireRoles } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);
router.use(requireRoles(['PATIENT', 'ADMIN']));

router.get('/doctors', PatientController.getDoctors);
router.get('/doctors/:id/slots', PatientController.getDoctorSlots);
router.post('/hold-slot', PatientController.holdSlot);
router.post('/book', PatientController.bookAppointment);
router.get('/appointments', PatientController.getAppointments);

export default router;
