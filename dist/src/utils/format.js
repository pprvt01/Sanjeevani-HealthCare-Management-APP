"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDoctorName = formatDoctorName;
/**
 * Helper to ensure clean "Dr. First Last" formatting without duplicate "Dr. Dr." prefixes.
 */
function formatDoctorName(name) {
    if (!name)
        return 'Dr. Unknown';
    const cleaned = name.replace(/^(Dr\.\s*)+/gi, '').trim();
    return `Dr. ${cleaned}`;
}
