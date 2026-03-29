// ── Booking page logic ────────────────────────────────

let selectedDate = null;
let selectedSlot = null;
let selectedServiceId = null;

function initBooking() {
  const serviceSelect = document.getElementById('service-select');
  const dateTabsContainer = document.getElementById('date-tabs');
  const slotsSection = document.getElementById('slots-section');
  const slotsGrid = document.getElementById('slots-grid');
  const confirmForm = document.getElementById('confirm-form');
  const inputDate = document.getElementById('input-date');
  const inputStart = document.getElementById('input-start');
  const inputServiceId = document.getElementById('input-service-id');
  const confirmBtn = document.getElementById('confirm-btn');

  if (!serviceSelect) return;

  // Date tab click
  dateTabsContainer.addEventListener('click', (e) => {
    const tab = e.target.closest('.date-tab');
    if (!tab) return;

    document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedDate = tab.dataset.date;
    selectedSlot = null;
    updateConfirmBtn();
    loadSlots();
  });

  // Service change
  serviceSelect.addEventListener('change', () => {
    selectedServiceId = serviceSelect.value;
    selectedSlot = null;
    updateConfirmBtn();
    if (selectedDate) loadSlots();
  });

  // Slot selection (delegated)
  slotsGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.slot-btn:not(:disabled)');
    if (!btn) return;

    document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedSlot = btn.dataset.start;
    updateConfirmBtn();
  });

  function updateConfirmBtn() {
    const nameField = document.getElementById('client_name');
    const emailField = document.getElementById('client_email');
    const phoneField = document.getElementById('client_phone');
    const clientDataRequired = nameField && emailField && phoneField;
    const clientDataFilled = !clientDataRequired ||
      (nameField.value.trim() && emailField.value.trim() && phoneField.value.trim());

    if (confirmBtn) {
      confirmBtn.disabled = !(selectedDate && selectedSlot && selectedServiceId && clientDataFilled);
    }
    if (inputDate) inputDate.value = selectedDate || '';
    if (inputStart) inputStart.value = selectedSlot || '';
    if (inputServiceId) inputServiceId.value = selectedServiceId || '';
  }

  // Re-check button when client data fields change
  ['client_name', 'client_email', 'client_phone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateConfirmBtn);
  });

  async function loadSlots() {
    if (!selectedDate || !selectedServiceId) return;

    slotsSection.style.display = 'block';
    // Skeleton loading
    const skeletonCount = 8;
    slotsGrid.innerHTML = Array(skeletonCount).fill('<div class="skeleton skeleton-slot"></div>').join('');

    try {
      const res = await fetch(`/api/slots?target_date=${selectedDate}&service_id=${selectedServiceId}`);
      const data = await res.json();

      if (!data.slots || data.slots.length === 0) {
        slotsGrid.innerHTML = '<div class="empty" style="grid-column:1/-1;padding:2rem"><p>No hay huecos disponibles este dia</p></div>';
        return;
      }

      slotsGrid.innerHTML = data.slots.map(s => {
        const isPreselected = window._preselectedSlot && s.start_time === window._preselectedSlot;
        return `<button
          type="button"
          class="slot-btn${isPreselected ? ' selected' : ''}"
          data-start="${s.start_time}"
          ${(!s.available && !isPreselected) ? 'disabled' : ''}
        >${s.start_time}</button>`;
      }).join('');

      // If there's a pre-selected slot, mark it
      if (window._preselectedSlot) {
        const preBtn = slotsGrid.querySelector(`[data-start="${window._preselectedSlot}"]`);
        if (preBtn) {
          document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
          preBtn.classList.add('selected');
          selectedSlot = window._preselectedSlot;
          updateConfirmBtn();
        }
      }
    } catch (err) {
      slotsGrid.innerHTML = '<div class="empty" style="grid-column:1/-1">Error cargando horarios. Recarga la pagina.</div>';
    }
  }

  // Auto-select first service
  if (serviceSelect.options.length > 0) {
    selectedServiceId = serviceSelect.value;
  }

  // Pre-select date/slot on edit page
  if (window._preselectedDate) {
    const preTab = dateTabsContainer.querySelector(`[data-date="${window._preselectedDate}"]`);
    if (preTab) {
      document.querySelectorAll('.date-tab').forEach(t => t.classList.remove('active'));
      preTab.classList.add('active');
      selectedDate = window._preselectedDate;
      if (window._preselectedSlot) {
        selectedSlot = window._preselectedSlot;
      }
      loadSlots();
    }
  }
}

// ── Admin: confirm before status change ───────────────
function initConfirmButtons() {
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm(btn.dataset.confirm)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  });
}

// ── Scroll-triggered animations ───────────────────────
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.service-card, .step-card').forEach(el => {
    el.classList.remove('animate-in');
    observer.observe(el);
  });
}

// ── Admin Dashboard ───────────────────────────────────
function initDashboard() {
  const weekStrip = document.getElementById('week-strip');
  const container = document.getElementById('day-appointments-container');
  const dayTitle = document.getElementById('day-title');
  if (!weekStrip || !container) return;

  const data = window._dashboardData || {};

  // Week strip click handler
  weekStrip.addEventListener('click', (e) => {
    const pill = e.target.closest('.week-pill');
    if (!pill) return;

    const date = pill.dataset.date;
    document.querySelectorAll('.week-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    if (date === data.today) {
      // Reload page to show today with server-rendered template
      window.location.reload();
      return;
    }

    loadDayAppointments(date);
  });

  // Load appointments for a specific day via AJAX
  async function loadDayAppointments(date) {
    dayTitle.textContent = 'Citas del ' + date;
    const timeline = container.querySelector('.timeline, .empty, .day-appointments');
    if (timeline) timeline.remove();

    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.innerHTML = '<span class="spinner"></span> Cargando...';
    container.appendChild(loading);

    try {
      const res = await fetch(`/admin/api/day?date=${date}`);
      const appointments = await res.json();
      loading.remove();

      if (!appointments.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.innerHTML = '<p>No hay citas para este dia.</p>';
        container.appendChild(empty);
        return;
      }

      const div = document.createElement('div');
      div.className = 'timeline day-appointments';
      div.innerHTML = appointments.map(a => `
        <div class="timeline-item">
          <div class="timeline-time">${a.start_time}</div>
          <div class="timeline-info">
            <div class="timeline-name">${a.client_name}</div>
            <div class="timeline-service">${a.service_name} · ${a.duration_minutes} min${
              a.client_phone ? ' · <a href="tel:' + a.client_phone + '">' + a.client_phone + '</a>' : ''
            }</div>
          </div>
          <span class="badge badge-${a.status}">${a.status}</span>
        </div>
      `).join('');
      container.appendChild(div);
    } catch (err) {
      loading.remove();
      const errorEl = document.createElement('div');
      errorEl.className = 'empty';
      errorEl.innerHTML = '<p>Error cargando citas.</p>';
      container.appendChild(errorEl);
    }
  }

  // Current appointment countdown
  updateCountdown();
  setInterval(updateCountdown, 30000);

  // Auto-refresh current appointment highlight
  setInterval(refreshCurrentHighlight, 60000);
}

function updateCountdown() {
  const el = document.getElementById('current-appt-countdown');
  if (!el) return;

  const startStr = el.dataset.start;
  const endStr = el.dataset.end;
  if (!startStr) return;

  const now = new Date();
  const [sh, sm] = startStr.split(':').map(Number);
  const [eh, em] = endStr.split(':').map(Number);

  const startToday = new Date(now);
  startToday.setHours(sh, sm, 0, 0);
  const endToday = new Date(now);
  endToday.setHours(eh, em, 0, 0);

  if (now >= startToday && now < endToday) {
    const remaining = Math.ceil((endToday - now) / 60000);
    el.textContent = 'En curso · ' + remaining + ' min restantes';
  } else if (now < startToday) {
    const mins = Math.ceil((startToday - now) / 60000);
    if (mins <= 60) {
      el.textContent = 'En ' + mins + ' min';
    } else {
      el.textContent = 'A las ' + startStr;
    }
  } else {
    el.textContent = 'Finalizada';
  }
}

function refreshCurrentHighlight() {
  const items = document.querySelectorAll('.timeline-item[data-start]');
  if (!items.length) return;

  const now = new Date();
  const nowStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

  items.forEach(item => {
    const start = item.dataset.start;
    const end = item.dataset.end;
    item.classList.remove('is-past', 'is-current');

    if (end <= nowStr) {
      item.classList.add('is-past');
    } else if (start <= nowStr && end > nowStr) {
      item.classList.add('is-current');
    }
  });
}

// ── Init ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initBooking();
  initConfirmButtons();
  initScrollAnimations();
  initDashboard();
});
