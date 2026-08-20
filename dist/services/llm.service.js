"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMService = void 0;
const genai_1 = require("@google/genai");
const config_1 = require("../config");
class LLMService {
    static ai = config_1.CONFIG.GEMINI_API_KEY && config_1.CONFIG.GEMINI_API_KEY !== 'mock-gemini-key'
        ? new genai_1.GoogleGenAI({ apiKey: config_1.CONFIG.GEMINI_API_KEY })
        : null;
    /**
     * Generates Pre-visit summary for Doctor based on patient symptoms.
     * Prompt: "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"
     * Returns fallback "Summary pending" on timeout or failure.
     */
    static async generatePreVisitSummary(symptoms) {
        const prompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}`;
        try {
            return await this.executeWithTimeout(async () => {
                if (!this.ai) {
                    // Smart realistic fallback/mock for local offline testing if no real key provided
                    return this.generateMockPreVisitSummary(symptoms);
                }
                const response = await this.ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });
                return response.text || 'Summary pending';
            }, config_1.CONFIG.LLM_TIMEOUT_MS);
        }
        catch (error) {
            console.warn('LLM Pre-Visit Summary call failed or timed out. Falling back to default.', error);
            return 'Summary pending';
        }
    }
    /**
     * Generates Post-visit patient summary based on doctor clinical notes.
     * Prompt: "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"
     * Returns fallback "Summary pending" on timeout or failure.
     */
    static async generatePostVisitSummary(notes) {
        const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}`;
        try {
            return await this.executeWithTimeout(async () => {
                if (!this.ai) {
                    return this.generateMockPostVisitSummary(notes);
                }
                const response = await this.ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });
                return response.text || 'Summary pending';
            }, config_1.CONFIG.LLM_TIMEOUT_MS);
        }
        catch (error) {
            console.warn('LLM Post-Visit Summary call failed or timed out. Falling back to default.', error);
            return 'Summary pending';
        }
    }
    /**
     * Promise timeout execution wrapper to guarantee graceful failure within CONFIG.LLM_TIMEOUT_MS
     */
    static executeWithTimeout(fn, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`LLM Request timed out after ${timeoutMs}ms`));
            }, timeoutMs);
            fn()
                .then((result) => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch((err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }
    static generateMockPreVisitSummary(symptoms) {
        const isHigh = /chest pain|severe|shortness of breath|fainting|bleeding|high fever/i.test(symptoms);
        const isMedium = /cough|migraine|dizziness|joint pain|rash|nausea/i.test(symptoms);
        const urgency = isHigh ? 'High' : isMedium ? 'Medium' : 'Low';
        return `**Urgency Level**: ${urgency}\n` +
            `**Chief Complaint**: Patient reports: "${symptoms.slice(0, 100)}..."\n` +
            `**Suggested Questions for Doctor**:\n` +
            `1. How long have these specific symptoms been persisting and have they worsened?\n` +
            `2. Are there any triggering factors or accompanying systemic signs (e.g. fever, fatigue)?\n` +
            `3. Have you taken any over-the-counter medications or previous treatments for this condition?`;
    }
    static generateMockPostVisitSummary(notes) {
        return `### Patient Visit Summary\n\n` +
            `**Doctor Notes Summary**: ${notes}\n\n` +
            `**Medication Schedule**:\n` +
            `- Take prescribed medication twice daily after meals (Morning & Evening).\n` +
            `- Maintain regular hydration and adequate rest.\n\n` +
            `**Follow-up Steps**:\n` +
            `- Monitor symptom changes over the next 5-7 days.\n` +
            `- Schedule a follow-up consultation if symptoms persist or deteriorate.`;
    }
}
exports.LLMService = LLMService;
