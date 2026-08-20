// Healthcare Appointment & Follow-up Manager SPA Frontend Client

let currentUser = null;
let authToken = localStorage.getItem('token');
let currentHold = null;
let holdCountdownInterval = null;
let selectedDoctorId = null;
let selectedSlot = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  const todayStr = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('patient-date-select');
  if (dateInput) dateInput.value = todayStr;
  
  const adminLeaveDate = document.getElementById('admin-leave-date');
  if (adminLeaveDate) adminLeaveDate.value = todayStr;

  if (authToken) {
    fetchCurrentUser();
  } else {
    showAuthView();
  }
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  const options = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`/api${endpoint}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'API Request failed');
  }

  return data;
}

// Auth State Management
async function fetchCurrentUser() {
  try {
    const data = await apiCall('/auth/me');
    currentUser = data.user;
    renderUserNav();
    showAppView();
  } catch (err) {
    console.warn('Session expired or invalid token:', err);
    logout();
  }
}

function showAuthView() {
  document.getElementById('auth-view').style.display = 'block';
  document.getElementById('app-view').style.display = 'none';
  document.getElementById('nav-user-area').replaceChildren();
}

function showAppView() {
  document.getElementById('auth-view').style.display = 'none';
  document.getElementById('app-view').style.display = 'block';

  // Default portal display based on user role
  if (currentUser.role === 'DOCTOR') {
    showPortalTab('doctor');
  } else if (currentUser.role === 'ADMIN') {
    showPortalTab('admin');
  } else {
    showPortalTab('patient');
  }
}

function renderUserNav() {
  const container = document.getElementById('nav-user-area');
  container.replaceChildren();

  if (!currentUser) return;

  const userBadge = document.createElement('div');
  userBadge.className = 'user-badge';

  const rolePill = document.createElement('span');
  rolePill.className = `role-pill role-${currentUser.role}`;
  rolePill.textContent = currentUser.role;

  const userName = document.createElement('span');
  userName.textContent = currentUser.name;

  userBadge.appendChild(rolePill);
  userBadge.appendChild(userName);

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn btn-secondary';
  logoutBtn.style.padding = '0.4rem 0.8rem';
  logoutBtn.style.fontSize = '0.8rem';
  logoutBtn.textContent = 'Logout';
  logoutBtn.onclick = logout;

  container.appendChild(userBadge);
  container.appendChild(logoutBtn);
}

function logout() {
  localStorage.removeItem('token');
  authToken = null;
  currentUser = null;
  if (holdCountdownInterval) clearInterval(holdCountdownInterval);
  currentHold = null;
  showAuthView();
  showToast('Logged out successfully', 'info');
}

function switchAuthTab(tab) {
  document.getElementById('auth-tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('auth-tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();

  try {
    const data = await apiCall('/auth/login', 'POST', { email, password });
    authToken = data.token;
    localStorage.setItem('token', authToken);
    currentUser = data.user;
    renderUserNav();
    showAppView();
    showToast(`Welcome back, ${currentUser.name}!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  try {
    const data = await apiCall('/auth/register', 'POST', { name, email, password });
    authToken = data.token;
    localStorage.setItem('token', authToken);
    currentUser = data.user;
    renderUserNav();
    showAppView();
    showToast('Registration successful! Welcome!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showPortalTab(tab) {
  document.getElementById('tab-patient').classList.toggle('active', tab === 'patient');
  document.getElementById('tab-doctor').classList.toggle('active', tab === 'doctor');
  document.getElementById('tab-admin').classList.toggle('active', tab === 'admin');

  document.getElementById('portal-patient').style.display = tab === 'patient' ? 'block' : 'none';
  document.getElementById('portal-doctor').style.display = tab === 'doctor' ? 'block' : 'none';
  document.getElementById('portal-admin').style.display = tab === 'admin' ? 'block' : 'none';

  if (tab === 'patient') {
    loadDoctors();
    loadPatientAppointments();
  } else if (tab === 'doctor') {
    loadDoctorSchedule();
  } else if (tab === 'admin') {
    loadAdminDoctorsDropdown();
    loadAdminOverview();
    loadAdminQueue();
  }
}

// ================= PATIENT PORTAL LOGIC =================
async function loadDoctors() {
  const spec = document.getElementById('patient-search-spec').value.trim();
  const endpoint = spec ? `/patient/doctors?specialization=${encodeURIComponent(spec)}` : '/patient/doctors';

  try {
    const data = await apiCall(endpoint);
    renderDoctorsGrid(data.doctors);
  } catch (err) {
    showToast('Failed to load doctors list', 'error');
  }
}

function renderDoctorsGrid(doctors) {
  const grid = document.getElementById('doctors-list-grid');
  grid.replaceChildren();

  if (doctors.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.textContent = 'No doctors found matching criteria.';
    grid.appendChild(emptyMsg);
    return;
  }

  doctors.forEach((doc) => {
    const card = document.createElement('div');
    card.className = 'doctor-card';

    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.gap = '1rem';

    const avatar = document.createElement('div');
    avatar.className = 'doc-avatar';
    avatar.textContent = doc.user.name.charAt(4) || 'D';

    const info = document.createElement('div');
    info.className = 'doc-info';

    const name = document.createElement('h3');
    name.textContent = doc.user.name;

    const spec = document.createElement('div');
    spec.className = 'doc-spec';
    spec.textContent = doc.specialization;

    info.appendChild(name);
    info.appendChild(spec);
    headerDiv.appendChild(avatar);
    headerDiv.appendChild(info);

    const hours = document.createElement('p');
    hours.style.fontSize = '0.85rem';
    hours.style.color = 'var(--text-muted)';
    hours.textContent = `⏰ Hours: ${doc.workingHoursStart} - ${doc.workingHoursEnd} (${doc.slotDuration} min slots)`;

    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.style.width = '100%';
    btn.textContent = 'Select Doctor & View Slots';
    btn.onclick = () => selectDoctor(doc);

    card.appendChild(headerDiv);
    card.appendChild(hours);
    card.appendChild(btn);

    grid.appendChild(card);
  });
}

function selectDoctor(doc) {
  selectedDoctorId = doc.id;
  document.getElementById('slots-container-panel').style.display = 'block';
  document.getElementById('selected-doc-title').textContent = `Slots for ${doc.user.name}`;
  document.getElementById('selected-doc-subtitle').textContent = `Specialization: ${doc.specialization} | Working Hours: ${doc.workingHoursStart} - ${doc.workingHoursEnd}`;
  loadSlots();
}

function onDateOrDoctorChange() {
  if (selectedDoctorId) {
    loadSlots();
  }
}

async function loadSlots() {
  if (!selectedDoctorId) return;

  const date = document.getElementById('patient-date-select').value;
  try {
    const data = await apiCall(`/patient/doctors/${selectedDoctorId}/slots?date=${date}`);
    renderSlotsGrid(data);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderSlotsGrid(data) {
  const container = document.getElementById('slot-grid');
  container.replaceChildren();

  if (data.isOnLeave) {
    const leaveMsg = document.createElement('div');
    leaveMsg.style.gridColumn = '1 / -1';
    leaveMsg.style.padding = '1.2rem';
    leaveMsg.style.background = 'rgba(239, 68, 68, 0.1)';
    leaveMsg.style.border = '1px solid var(--danger)';
    leaveMsg.style.borderRadius = '8px';
    leaveMsg.style.color = '#f87171';
    leaveMsg.style.fontWeight = '600';
    leaveMsg.textContent = `⚠️ Doctor is on leave on ${data.date}. No slots available.`;
    container.appendChild(leaveMsg);
    return;
  }

  if (data.slots.length === 0) {
    const noSlots = document.createElement('p');
    noSlots.textContent = 'No slots available for this date.';
    container.appendChild(noSlots);
    return;
  }

  data.slots.forEach((slotInfo) => {
    const btn = document.createElement('button');
    btn.className = 'slot-btn';

    if (slotInfo.available) {
      btn.classList.add('available');
      btn.textContent = slotInfo.timeSlot;
      btn.onclick = () => initiateHoldSlot(data.doctor.id, data.date, slotInfo.timeSlot);
    } else if (slotInfo.isHeld) {
      btn.classList.add('held', 'disabled');
      btn.textContent = `${slotInfo.timeSlot} (Held)`;
    } else {
      btn.classList.add('disabled');
      btn.textContent = `${slotInfo.timeSlot} (Booked)`;
    }

    container.appendChild(btn);
  });
}

async function initiateHoldSlot(doctorId, date, timeSlot) {
  try {
    const data = await apiCall('/patient/hold-slot', 'POST', { doctorId, date, timeSlot });
    currentHold = data.hold;
    selectedSlot = { doctorId, date, timeSlot };

    showToast(data.message, 'success');
    startHoldCountdown(data.hold.ttlSeconds);
    openBookingModal(date, timeSlot);
    loadSlots();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function startHoldCountdown(totalSeconds) {
  if (holdCountdownInterval) clearInterval(holdCountdownInterval);

  const banner = document.getElementById('slot-hold-banner');
  const timerDisplay = document.getElementById('hold-timer-display');
  const bannerDetails = document.getElementById('hold-banner-details');

  banner.style.display = 'flex';
  bannerDetails.textContent = `Holding slot ${selectedSlot.timeSlot} on ${selectedSlot.date}. Complete your symptoms form before timer expires.`;

  let remaining = totalSeconds;

  const updateDisplay = () => {
    const mins = Math.floor(remaining / 60).toString().padStart(2, '0');
    const secs = (remaining % 60).toString().padStart(2, '0');
    timerDisplay.textContent = `${mins}:${secs}`;

    if (remaining <= 0) {
      clearInterval(holdCountdownInterval);
      banner.style.display = 'none';
      currentHold = null;
      showToast('Slot hold expired. Please re-select a slot.', 'error');
      closeModal('booking-modal');
      loadSlots();
    }
    remaining--;
  };

  updateDisplay();
  holdCountdownInterval = setInterval(updateDisplay, 1000);
}

function openBookingModal(date, timeSlot) {
  document.getElementById('modal-slot-desc').textContent = `Booking slot: ${date} at ${timeSlot}`;
  document.getElementById('modal-symptoms-input').value = '';
  document.getElementById('booking-modal').classList.add('active');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

async function handleConfirmBooking(e) {
  e.preventDefault();
  if (!selectedSlot) return;

  const symptoms = document.getElementById('modal-symptoms-input').value.trim();
  if (!symptoms) return;

  try {
    const data = await apiCall('/patient/book', 'POST', {
      doctorId: selectedSlot.doctorId,
      date: selectedSlot.date,
      timeSlot: selectedSlot.timeSlot,
      symptoms,
    });

    closeModal('booking-modal');
    if (holdCountdownInterval) clearInterval(holdCountdownInterval);
    document.getElementById('slot-hold-banner').style.display = 'none';
    currentHold = null;

    showToast('Appointment successfully confirmed!', 'success');
    loadPatientAppointments();
    loadSlots();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadPatientAppointments() {
  try {
    const data = await apiCall('/patient/appointments');
    renderPatientAppointments(data.appointments);
  } catch (err) {
    showToast('Failed to load appointments', 'error');
  }
}

function renderPatientAppointments(appointments) {
  const container = document.getElementById('patient-appointments-list');
  container.replaceChildren();

  if (appointments.length === 0) {
    const empty = document.createElement('p');
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'No appointments found.';
    container.appendChild(empty);
    return;
  }

  appointments.forEach((appt) => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.marginBottom = '1rem';
    card.style.padding = '1.5rem';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '1rem';

    const title = document.createElement('h3');
    title.textContent = `Dr. ${appt.doctor.user.name} (${appt.doctor.specialization})`;

    const statusPill = document.createElement('span');
    statusPill.className = `badge-status status-${appt.status}`;
    statusPill.textContent = appt.status;

    header.appendChild(title);
    header.appendChild(statusPill);

    const details = document.createElement('p');
    details.style.fontSize = '0.9rem';
    details.style.color = 'var(--text-muted)';
    details.style.marginBottom = '1rem';
    details.textContent = `📅 Date: ${appt.date} | ⏰ Time: ${appt.timeSlot} | 🔗 GCal Event: ${appt.gcalEventId || 'Synced'}`;

    const symptomsDiv = document.createElement('div');
    symptomsDiv.style.marginBottom = '0.8rem';
    symptomsDiv.style.fontSize = '0.9rem';
    symptomsDiv.innerHTML = `<strong>Reported Symptoms:</strong> ${appt.symptoms}`;

    card.appendChild(header);
    card.appendChild(details);
    card.appendChild(symptomsDiv);

    if (appt.preVisitSummary) {
      const aiPre = document.createElement('div');
      aiPre.className = 'ai-card';
      aiPre.innerHTML = `<h4>🤖 AI Pre-Visit Symptom Assessment</h4><div class="ai-text">${appt.preVisitSummary}</div>`;
      card.appendChild(aiPre);
    }

    if (appt.postVisitSummary) {
      const aiPost = document.createElement('div');
      aiPost.className = 'ai-card';
      aiPost.style.background = 'rgba(16, 185, 129, 0.08)';
      aiPost.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      aiPost.innerHTML = `<h4 style="color: #34d399;">📋 Patient-Friendly Post-Visit Summary & Prescription</h4><div class="ai-text">${appt.postVisitSummary}</div>`;
      card.appendChild(aiPost);
    }

    container.appendChild(card);
  });
}

// ================= DOCTOR PORTAL LOGIC =================
async function loadDoctorSchedule() {
  try {
    const data = await apiCall('/doctor/schedule');
    renderDoctorSchedule(data.appointments);
  } catch (err) {
    showToast(err.message || 'Failed to load doctor schedule', 'error');
  }
}

function renderDoctorSchedule(appointments) {
  const container = document.getElementById('doctor-appointments-list');
  container.replaceChildren();

  if (appointments.length === 0) {
    const empty = document.createElement('p');
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'No appointments scheduled.';
    container.appendChild(empty);
    return;
  }

  appointments.forEach((appt) => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.marginBottom = '1.2rem';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '0.8rem';

    const name = document.createElement('h3');
    name.textContent = `Patient: ${appt.patient.name} (${appt.patient.email})`;

    const statusPill = document.createElement('span');
    statusPill.className = `badge-status status-${appt.status}`;
    statusPill.textContent = appt.status;

    header.appendChild(name);
    header.appendChild(statusPill);

    const time = document.createElement('p');
    time.style.fontSize = '0.9rem';
    time.style.color = 'var(--text-muted)';
    time.style.marginBottom = '1rem';
    time.textContent = `📅 ${appt.date} at ${appt.timeSlot}`;

    const symptoms = document.createElement('p');
    symptoms.style.fontSize = '0.9rem';
    symptoms.style.marginBottom = '0.8rem';
    symptoms.innerHTML = `<strong>Patient Symptoms:</strong> ${appt.symptoms}`;

    card.appendChild(header);
    card.appendChild(time);
    card.appendChild(symptoms);

    if (appt.preVisitSummary) {
      const aiPre = document.createElement('div');
      aiPre.className = 'ai-card';
      aiPre.innerHTML = `<h4>🤖 AI Pre-Visit Summary for Doctor</h4><div class="ai-text">${appt.preVisitSummary}</div>`;
      card.appendChild(aiPre);
    }

    if (appt.status === 'BOOKED') {
      const notesBtn = document.createElement('button');
      notesBtn.className = 'btn btn-primary';
      notesBtn.style.marginTop = '1rem';
      notesBtn.textContent = 'Submit Clinical Notes & Prescription';
      notesBtn.onclick = () => openNotesModal(appt);
      card.appendChild(notesBtn);
    } else if (appt.postVisitSummary) {
      const notesDone = document.createElement('div');
      notesDone.className = 'ai-card';
      notesDone.style.background = 'rgba(16, 185, 129, 0.08)';
      notesDone.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      notesDone.innerHTML = `<h4 style="color: #34d399;">Submitted Notes Summary</h4><div class="ai-text">${appt.postVisitSummary}</div>`;
      card.appendChild(notesDone);
    }

    container.appendChild(card);
  });
}

function openNotesModal(appt) {
  document.getElementById('notes-appt-id').value = appt.id;
  document.getElementById('notes-patient-desc').textContent = `Patient: ${appt.patient.name} (${appt.date} at ${appt.timeSlot})`;
  document.getElementById('modal-notes-input').value = '';
  document.getElementById('notes-modal').classList.add('active');
}

async function handleSaveClinicalNotes(e) {
  e.preventDefault();
  const apptId = document.getElementById('notes-appt-id').value;
  const clinicalNotes = document.getElementById('modal-notes-input').value.trim();
  const sendMedicationReminder = document.getElementById('modal-med-reminder').checked;

  if (!clinicalNotes) return;

  try {
    const data = await apiCall(`/doctor/appointments/${apptId}/clinical-notes`, 'POST', {
      clinicalNotes,
      sendMedicationReminder,
    });

    closeModal('notes-modal');
    showToast('Clinical notes saved & AI summary generated!', 'success');
    loadDoctorSchedule();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ================= ADMIN PORTAL LOGIC =================
async function loadAdminDoctorsDropdown() {
  try {
    const data = await apiCall('/admin/doctors');
    const select = document.getElementById('admin-leave-doc-select');
    select.replaceChildren();

    data.doctors.forEach((doc) => {
      const opt = document.createElement('option');
      opt.value = doc.id;
      opt.textContent = `${doc.user.name} (${doc.specialization})`;
      select.appendChild(opt);
    });
  } catch (err) {
    console.warn('Error loading admin doctors dropdown:', err);
  }
}

async function handleCreateDoctor(e) {
  e.preventDefault();
  const name = document.getElementById('admin-doc-name').value.trim();
  const email = document.getElementById('admin-doc-email').value.trim();
  const password = document.getElementById('admin-doc-password').value.trim();
  const specialization = document.getElementById('admin-doc-spec').value.trim();
  const workingHoursStart = document.getElementById('admin-doc-start').value.trim();
  const workingHoursEnd = document.getElementById('admin-doc-end').value.trim();
  const slotDuration = document.getElementById('admin-doc-slot').value;

  try {
    await apiCall('/admin/doctors', 'POST', {
      name,
      email,
      password,
      specialization,
      workingHoursStart,
      workingHoursEnd,
      slotDuration,
    });

    showToast(`Doctor profile for ${name} created successfully!`, 'success');
    loadAdminDoctorsDropdown();
    loadAdminOverview();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleMarkLeave() {
  const doctorId = document.getElementById('admin-leave-doc-select').value;
  const date = document.getElementById('admin-leave-date').value;
  const reason = document.getElementById('admin-leave-reason').value.trim();

  if (!doctorId || !date) {
    showToast('Doctor and date are required', 'error');
    return;
  }

  try {
    const data = await apiCall(`/admin/doctors/${doctorId}/leave`, 'POST', { date, reason });
    showToast(data.message, 'success');
    loadAdminOverview();
    loadAdminQueue();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadAdminOverview() {
  try {
    const data = await apiCall('/admin/appointments');
    const container = document.getElementById('admin-all-appointments');
    container.replaceChildren();

    if (data.appointments.length === 0) {
      const empty = document.createElement('p');
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'No clinic appointments recorded yet.';
      container.appendChild(empty);
      return;
    }

    data.appointments.forEach((appt) => {
      const card = document.createElement('div');
      card.style.padding = '1rem';
      card.style.background = 'rgba(255,255,255,0.03)';
      card.style.borderRadius = '8px';
      card.style.marginBottom = '0.6rem';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';
      card.style.alignItems = 'center';

      const left = document.createElement('div');
      left.innerHTML = `<strong>Dr. ${appt.doctor.user.name}</strong> (${appt.doctor.specialization}) &bull; Patient: <em>${appt.patient.name}</em><br><small style="color: var(--text-muted)">Date: ${appt.date} at ${appt.timeSlot}</small>`;

      const right = document.createElement('div');
      right.className = `badge-status status-${appt.status}`;
      right.textContent = appt.status;

      card.appendChild(left);
      card.appendChild(right);
      container.appendChild(card);
    });
  } catch (err) {
    showToast('Failed to load admin appointment overview', 'error');
  }
}

async function loadAdminQueue() {
  try {
    const data = await apiCall('/admin/queue');
    const container = document.getElementById('admin-queue-list');
    container.replaceChildren();

    if (data.queue.length === 0) {
      const empty = document.createElement('p');
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'Notification queue is currently empty.';
      container.appendChild(empty);
      return;
    }

    data.queue.forEach((job) => {
      const card = document.createElement('div');
      card.style.padding = '0.8rem 1rem';
      card.style.background = 'rgba(255,255,255,0.02)';
      card.style.border = '1px solid var(--border-color)';
      card.style.borderRadius = '6px';
      card.style.marginBottom = '0.5rem';
      card.style.fontSize = '0.85rem';
      card.style.display = 'flex';
      card.style.justifyContent = 'space-between';

      const details = document.createElement('div');
      details.innerHTML = `<strong>${job.type}</strong> &bull; Status: <span style="color: var(--secondary)">${job.status}</span> (Attempts: ${job.attempts}/${job.maxAttempts})<br><small style="color: var(--text-muted)">Payload: ${job.payload.slice(0, 100)}...</small>`;

      card.appendChild(details);
      container.appendChild(card);
    });
  } catch (err) {
    showToast('Failed to load queue monitor', 'error');
  }
}
