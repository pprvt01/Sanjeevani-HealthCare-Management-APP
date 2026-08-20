import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticateJWT, requireRoles } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);
router.use(requireRoles(['ADMIN']));

router.post('/doctors', AdminController.createDoctor);
router.get('/doctors', AdminController.listDoctors);
router.post('/doctors/:id/leave', AdminController.setDoctorLeave);
router.get('/appointments', AdminController.listAllAppointments);
router.get('/queue', AdminController.listQueue);

export default router;
