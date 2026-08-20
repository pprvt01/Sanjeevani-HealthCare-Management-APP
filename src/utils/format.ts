/**
 * Helper to ensure clean "Dr. First Last" formatting without duplicate "Dr. Dr." prefixes.
 */
export function formatDoctorName(name: string): string {
  if (!name) return 'Dr. Unknown';
  const cleaned = name.replace(/^(Dr\.\s*)+/gi, '').trim();
  return `Dr. ${cleaned}`;
}
