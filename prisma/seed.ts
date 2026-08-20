import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const DOCTOR_NAMES = [
  'Naresh Trehan',
  'Devi Prasad Shetty',
  'Randeep Guleria',
  'Ashok Seth',
  'Aruna Kalra',
];

const PATIENT_NAMES = [
  'Rajesh Sharma',
  'Sunita Patel',
  'Amit Verma',
  'Priya Nair',
  'Suresh Iyer',
  'Ananya Mukherjee',
  'Vikram Singh',
  'Kavita Rao',
];

const SPECIALIZATIONS = [
  'Cardiology',
  'Dermatology',
  'Neurology',
  'Pediatrics',
  'General Practice',
  'Orthopedics',
];

const SAMPLE_SYMPTOMS = [
  'Persistent dry cough for 4 days, mild shortness of breath, and low-grade fever (100.4°F).',
  'Sharp lower back pain radiating down the right leg, aggravated when sitting.',
  'Severe throbbing migraine on the left side with light sensitivity and nausea.',
  'Skin rash on upper chest and arms with severe itching after starting new detergent.',
  'Persistent fatigue, joint stiffness in both knees, and occasional dizziness in the morning.',
  'Child experiencing high fever (102°F), sore throat, loss of appetite, and nasal congestion.',
];

const SAMPLE_NOTES = [
  'Patient diagnosed with acute upper respiratory tract infection. Advised rest, hydration, and Paracetamol 500mg as needed.',
  'Symptoms consistent with lumbar radiculopathy. Prescribed Ibuprofen 400mg twice daily after food and recommended gentle physiotherapy.',
  'Migraine with aura. Prescribed Sumatriptan 50mg at onset and recommended stress reduction techniques.',
  'Contact dermatitis diagnosed. Prescribed Hydrocortisone cream 1% to apply twice daily for 7 days.',
  'Early osteoarthritis signs. Recommended daily warm compresses, mild daily walk, and Calcium + Vitamin D supplements.',
  'Pediatric viral pharyngitis. Prescribed Children Paracetamol syrup and warm fluids intake.',
];

async function main() {
  console.log('Starting Database Seeding with custom Doctor & Patient names...');

  // Reset database tables
  await prisma.notificationQueue.deleteMany();
  await prisma.slotHold.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.leave.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.user.deleteMany();

  const commonPasswordHash = await bcrypt.hash('password123', 10);

  // 1. Create Admin User
  const admin = await prisma.user.create({
    data: {
      name: 'System Administrator',
      email: 'admin@clinic.com',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'ADMIN',
    },
  });
  console.log(`Admin created: ${admin.email} (Password: admin123)`);

  // 2. Create Doctors
  const doctors = [];
  for (let i = 0; i < DOCTOR_NAMES.length; i++) {
    const rawName = DOCTOR_NAMES[i];
    const email = `doctor${i + 1}@clinic.com`;
    const specialization = SPECIALIZATIONS[i % SPECIALIZATIONS.length];
    const workingHoursStart = i % 2 === 0 ? '08:00' : '09:00';
    const workingHoursEnd = i % 2 === 0 ? '16:00' : '17:00';
    const slotDuration = [20, 30, 45][i % 3];

    const user = await prisma.user.create({
      data: {
        name: rawName,
        email,
        passwordHash: commonPasswordHash,
        role: 'DOCTOR',
      },
    });

    const doctor = await prisma.doctor.create({
      data: {
        userId: user.id,
        specialization,
        workingHoursStart,
        workingHoursEnd,
        slotDuration,
      },
      include: { user: true },
    });

    doctors.push(doctor);
    console.log(`Doctor created: Dr. ${rawName} (${specialization}) - ${email}`);
  }

  // 3. Create Patients
  const patients = [];
  for (let i = 0; i < PATIENT_NAMES.length; i++) {
    const name = PATIENT_NAMES[i];
    const email = i === 0 ? 'patient@clinic.com' : `patient${i + 1}@example.com`;

    const patient = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash: commonPasswordHash,
        role: 'PATIENT',
      },
    });

    patients.push(patient);
    console.log(`Patient created: ${name} - ${email}`);
  }

  // 4. Create Sample Doctor Leave
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0];

  await prisma.leave.create({
    data: {
      doctorId: doctors[0].id,
      date: tomorrow,
      reason: 'Attending Medical Conference',
    },
  });
  console.log(`Leave day added for Dr. ${doctors[0].user.name} on ${tomorrow}`);

  // 5. Create Sample Appointments (Past & Future)
  const timeSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '14:00', '14:30', '15:00'];

  for (let i = 0; i < 6; i++) {
    const doctor = doctors[i % doctors.length];
    const patient = patients[i % patients.length];
    const timeSlot = timeSlots[i % timeSlots.length];
    const symptoms = SAMPLE_SYMPTOMS[i % SAMPLE_SYMPTOMS.length];
    const notes = SAMPLE_NOTES[i % SAMPLE_NOTES.length];
    const isCompleted = i % 2 === 0;

    await prisma.appointment.create({
      data: {
        patientId: patient.id,
        doctorId: doctor.id,
        date: today,
        timeSlot,
        status: isCompleted ? 'COMPLETED' : 'BOOKED',
        symptoms,
        preVisitSummary: `**Urgency Level**: ${i % 3 === 0 ? 'High' : 'Medium'}\n**Chief Complaint**: ${symptoms.slice(0, 80)}\n**Suggested Questions**:\n1. Duration of symptoms?\n2. Prior treatments tried?\n3. Any drug allergies?`,
        clinicalNotes: isCompleted ? notes : null,
        postVisitSummary: isCompleted ? `### Patient Friendly Summary\n\n**Diagnosis**: ${notes.slice(0, 100)}\n\n**Medication Schedule**:\n- Take prescribed medicine twice daily after meals.\n\n**Follow-up Steps**:\n- Return for checkup in 7 days.` : null,
        gcalEventId: `gcal_seed_${i + 1}`,
      },
    });
  }

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

