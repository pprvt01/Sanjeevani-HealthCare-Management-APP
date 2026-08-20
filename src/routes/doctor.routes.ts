import { Router } from 'express';
import { DoctorController } from '../controllers/doctor.controller';
import { authenticateJWT, requireRoles } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);
router.use(requireRoles(['DOCTOR', 'ADMIN']));

router.get('/schedule', DoctorController.getSchedule);
router.post('/appointments/:id/clinical-notes', DoctorController.submitClinicalNotes);

export default router;
