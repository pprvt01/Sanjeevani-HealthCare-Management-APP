import express from 'express';
import cors from 'cors';
import path from 'path';
import { CONFIG } from './config';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import doctorRoutes from './routes/doctor.routes';
import adminRoutes from './routes/admin.routes';
import { BackgroundScheduler } from './utils/scheduler';

const app = express();

// Security & Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
const publicDir = path.resolve(process.cwd(), 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/patient', patientRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Fallback to index.html for SPA frontend
app.use((req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Start Server & Background Queue Scheduler
const PORT = CONFIG.PORT;

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` Sanjeevani - Healthcare Appointment & Follow-up Manager`);
  console.log(` Server running on: http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=======================================================`);

  BackgroundScheduler.start(10000);
});
