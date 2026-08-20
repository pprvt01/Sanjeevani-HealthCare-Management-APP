"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../models/prisma");
const config_1 = require("../config");
class AuthController {
    static async register(req, res) {
        try {
            const { name, email, password, role } = req.body;
            if (!name || !email || !password) {
                return res.status(400).json({ error: 'Name, email, and password are required' });
            }
            const existingUser = await prisma_1.prisma.user.findUnique({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ error: 'User with this email already exists' });
            }
            const userRole = role === 'ADMIN' ? 'ADMIN' : 'PATIENT'; // Public registration creates PATIENTS (Admin created via seed/script)
            const passwordHash = await bcrypt_1.default.hash(password, 10);
            const user = await prisma_1.prisma.user.create({
                data: {
                    name,
                    email,
                    passwordHash,
                    role: userRole,
                },
            });
            const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, config_1.CONFIG.JWT_SECRET, { expiresIn: '7d' });
            return res.status(201).json({
                message: 'Registration successful',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                },
            });
        }
        catch (error) {
            console.error('Registration error:', error);
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }
    static async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return res.status(400).json({ error: 'Email and password are required' });
            }
            const user = await prisma_1.prisma.user.findUnique({
                where: { email },
                include: { doctorProfile: true },
            });
            if (!user) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            const isPasswordValid = await bcrypt_1.default.compare(password, user.passwordHash);
            if (!isPasswordValid) {
                return res.status(401).json({ error: 'Invalid email or password' });
            }
            const token = jsonwebtoken_1.default.sign({ id: user.id, email: user.email, role: user.role, name: user.name }, config_1.CONFIG.JWT_SECRET, { expiresIn: '7d' });
            return res.json({
                message: 'Login successful',
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    doctorId: user.doctorProfile?.id || null,
                },
            });
        }
        catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }
    static async me(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }
            const user = await prisma_1.prisma.user.findUnique({
                where: { id: req.user.id },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                    createdAt: true,
                    doctorProfile: true,
                },
            });
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            return res.json({ user });
        }
        catch (error) {
            return res.status(500).json({ error: error.message || 'Internal server error' });
        }
    }
}
exports.AuthController = AuthController;
