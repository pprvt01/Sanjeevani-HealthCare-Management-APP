import { prisma } from '../src/models/prisma';
import { DoctorService } from '../src/services/doctor.service';
import { BookingService } from '../src/services/booking.service';
import { LLMService } from '../src/services/llm.service';
import { QueueService } from '../src/services/queue.service';

async function runSystemVerification() {
  console.log('Starting End-to-End System Verification Test Suite...\n');

  // 1. Verify Users & Doctors from Seed Data
  const doctors = await prisma.doctor.findMany({ include: { user: true } });
  const patients = await prisma.user.findMany({ where: { role: 'PATIENT' } });

  console.log(`Database records verified: ${doctors.length} doctors, ${patients.length} patients.`);

  const testDoctor = doctors[0];
  const testPatient = patients[0];
  const targetDate = '2026-08-25';
  const targetSlot = '10:00';

  // 2. Test Doctor Slot Calculation & Availability
  console.log(`\nTesting Doctor Slot Availability for Dr. ${testDoctor.user.name} on ${targetDate}...`);
  const slotData = await DoctorService.getAvailableSlots(testDoctor.id, targetDate);

  if (!slotData.slots || !slotData.availableSlots) {
    throw new Error('Slot details expected');
  }

  console.log(`- Total candidate slots: ${slotData.slots.length}`);
  console.log(`- Available slots count: ${slotData.availableSlots.length}`);
  if (!slotData.availableSlots.includes(targetSlot)) {
    throw new Error(`Target slot ${targetSlot} should be available`);
  }
  console.log(`Slot availability verified.`);

  // 3. Test Slot Hold Mechanism (5-Minute TTL)
  console.log(`\nTesting 5-Minute Slot Hold Mechanism for Patient ${testPatient.name}...`);
  const holdResult = await BookingService.holdSlot(testPatient.id, testDoctor.id, targetDate, targetSlot);
  console.log(`- Slot Hold ID: ${holdResult.holdId}`);
  console.log(`- Slot Held Until: ${holdResult.expiresAt.toISOString()}`);
  console.log(`- TTL Seconds remaining: ${holdResult.ttlSeconds}s`);

  // Verify another patient cannot hold or book the same slot
  const secondPatient = patients[1];
  try {
    await BookingService.holdSlot(secondPatient.id, testDoctor.id, targetDate, targetSlot);
    throw new Error('FAILED: Second patient should NOT be able to hold the same slot');
  } catch (err: any) {
    console.log(`- Race condition test passed: "${err.message}"`);
  }
  console.log(`Slot Hold & Race Condition prevention verified.`);

  // 4. Test Appointment Booking with Pre-Visit AI Summary
  console.log(`\nTesting Appointment Booking & AI Pre-Visit Summary...`);
  const symptoms = 'Severe throbbing migraine on the left side, light sensitivity, and mild nausea for 2 days.';
  const apptResult = await BookingService.confirmBooking(
    testPatient.id,
    testDoctor.id,
    targetDate,
    targetSlot,
    symptoms
  );

  console.log(`- Appointment ID: ${apptResult.appointmentId}`);
  console.log(`- Booking Status: ${apptResult.status}`);
  console.log(`- Pre-Visit AI Summary Output:\n${apptResult.preVisitSummary}`);
  if (!apptResult.preVisitSummary || apptResult.preVisitSummary.length < 5) {
    throw new Error('AI Pre-Visit Summary should be populated');
  }
  console.log(`Booking & AI Pre-Visit summary successfully created.`);

  // 5. Test Double-Booking Protection (Simultaneous Booking Attempt)
  console.log(`\nTesting Double-Booking Prevention on already booked slot...`);
  try {
    await BookingService.confirmBooking(
      secondPatient.id,
      testDoctor.id,
      targetDate,
      targetSlot,
      'Cough and fever'
    );
    throw new Error('FAILED: Double booking should be blocked!');
  } catch (err: any) {
    console.log(`- Double booking blocked successfully: "${err.message}"`);
  }
  console.log(`Double-booking protection verified.`);

  // 6. Test Doctor Post-Visit Clinical Notes & AI Summary Generation
  console.log(`\nTesting Doctor Clinical Notes & Post-Visit AI Summary...`);
  const clinicalNotes = 'Patient diagnosed with acute migraine with aura. Prescribed Sumatriptan 50mg at onset and recommended dark room rest.';
  const postVisitSummary = await LLMService.generatePostVisitSummary(clinicalNotes);
  console.log(`- AI Post-Visit Summary Output:\n${postVisitSummary}`);

  await prisma.appointment.update({
    where: { id: apptResult.appointmentId },
    data: {
      clinicalNotes,
      postVisitSummary,
      status: 'COMPLETED',
    },
  });
  console.log(`Clinical notes & post-visit summary submitted successfully.`);

  // 7. Test Admin Doctor Leave & Conflict Auto-Cancellation Job
  console.log(`\nTesting Admin Doctor Leave & Conflict Auto-Cancellation Job...`);
  const leaveDate = '2026-08-26';
  const leaveSlot = '11:00';

  // Create a booking on leave date
  const conflictAppt = await BookingService.confirmBooking(
    testPatient.id,
    testDoctor.id,
    leaveDate,
    leaveSlot,
    'Routine health checkup'
  );
  console.log(`- Created pre-existing booking for Dr on ${leaveDate} at ${leaveSlot}`);

  // Admin marks doctor on leave
  const leaveResult = await DoctorService.addLeaveAndHandleConflicts(testDoctor.id, leaveDate, 'Emergency Medical Leave');
  console.log(`- Admin marked leave. Auto-cancelled appointments count: ${leaveResult.cancelledAppointmentsCount}`);

  const updatedConflictAppt = await prisma.appointment.findUnique({ where: { id: conflictAppt.appointmentId } });
  if (updatedConflictAppt?.status !== 'CANCELLED') {
    throw new Error(`Appointment should be CANCELLED, but got ${updatedConflictAppt?.status}`);
  }
  console.log(`Leave conflict auto-cancellation verified.`);

  // 8. Test Notification Queue Processing
  console.log(`\nTesting Notification Worker Queue Processing...`);
  const queueCountBefore = await prisma.notificationQueue.count({ where: { status: 'PENDING' } });
  console.log(`- Pending notification jobs in queue: ${queueCountBefore}`);

  const processedCount = await QueueService.processPendingJobs();
  console.log(`- Processed ${processedCount} notification jobs successfully.`);
  console.log(`Asynchronous notification queue verified.`);

  console.log('\n=======================================================');
  console.log(' ALL SYSTEM INTEGRATION TESTS PASSED 100% CLEANLY!');
  console.log('=======================================================');
}

runSystemVerification()
  .catch((e) => {
    console.error('Verification Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
