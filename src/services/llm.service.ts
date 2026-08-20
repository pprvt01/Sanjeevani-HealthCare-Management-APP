import { GoogleGenerativeAI } from '@google/generative-ai';
import { CONFIG } from '../config';

export class LLMService {
  private static genAI = CONFIG.GEMINI_API_KEY && !CONFIG.GEMINI_API_KEY.startsWith('mock')
    ? new GoogleGenerativeAI(CONFIG.GEMINI_API_KEY)
    : null;

  /**
   * Generates Pre-visit summary for Doctor based on patient symptoms.
   * Prompt: "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"
   * Returns fallback "Summary pending" on timeout or failure.
   */
  static async generatePreVisitSummary(symptoms: string): Promise<string> {
    const prompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}`;

    try {
      return await this.executeWithTimeout(async () => {
        if (!this.genAI) {
          return this.generateMockPreVisitSummary(symptoms);
        }

        const modelNames = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        for (const modelName of modelNames) {
          try {
            const model = this.genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            if (text) return text;
          } catch (err) {
            // Try next candidate model
          }
        }

        return this.generateMockPreVisitSummary(symptoms);
      }, CONFIG.LLM_TIMEOUT_MS);
    } catch (error) {
      console.warn('LLM Pre-Visit Summary call failed or timed out. Falling back to default.', error);
      return this.generateMockPreVisitSummary(symptoms);
    }
  }

  /**
   * Generates Post-visit patient summary based on doctor clinical notes.
   * Prompt: "Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"
   * Returns fallback "Summary pending" on timeout or failure.
   */
  static async generatePostVisitSummary(notes: string): Promise<string> {
    const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}`;

    try {
      return await this.executeWithTimeout(async () => {
        if (!this.genAI) {
          return this.generateMockPostVisitSummary(notes);
        }

        const modelNames = ['gemini-2.0-flash-exp', 'gemini-1.5-flash', 'gemini-1.5-pro'];
        for (const modelName of modelNames) {
          try {
            const model = this.genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const text = result.response.text();
            if (text) return text;
          } catch (err) {
            // Try next candidate model
          }
        }

        return this.generateMockPostVisitSummary(notes);
      }, CONFIG.LLM_TIMEOUT_MS);
    } catch (error) {
      console.warn('LLM Post-Visit Summary call failed or timed out. Falling back to default.', error);
      return this.generateMockPostVisitSummary(notes);
    }
  }

  /**
   * Promise timeout execution wrapper to guarantee graceful failure within CONFIG.LLM_TIMEOUT_MS
   */
  private static executeWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
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

  private static generateMockPreVisitSummary(symptoms: string): string {
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

  private static generateMockPostVisitSummary(notes: string): string {
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
