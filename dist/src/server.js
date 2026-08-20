"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const patient_routes_1 = __importDefault(require("./routes/patient.routes"));
const doctor_routes_1 = __importDefault(require("./routes/doctor.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const scheduler_1 = require("./utils/scheduler");
const app = (0, express_1.default)();
// Security & Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Serve static frontend files
const publicDir = path_1.default.resolve(process.cwd(), 'public');
app.use(express_1.default.static(publicDir));
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/patient', patient_routes_1.default);
app.use('/api/doctor', doctor_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
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
    res.sendFile(path_1.default.join(publicDir, 'index.html'));
});
// Start Server & Background Queue Scheduler
const PORT = config_1.CONFIG.PORT;
app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Sanjeevani - Healthcare Appointment & Follow-up Manager`);
    console.log(` Server running on: http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
    console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`=======================================================`);
    scheduler_1.BackgroundScheduler.start(10000);
});
