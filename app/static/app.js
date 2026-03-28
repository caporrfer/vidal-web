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
    slotsGrid.innerHTML = '<div class="loading"><span class="spinner"></span> Cargando...</div>';

    try {
      const res = await fetch(`/api/slots?target_date=${selectedDate}&service_id=${selectedServiceId}`);
      const data = await res.json();

      if (!data.slots || data.slots.length === 0) {
        slotsGrid.innerHTML = '<div class="empty"><div class="icon">📅</div><p>No hay huecos disponibles este día</p></div>';
        return;
      }

      slotsGrid.innerHTML = data.slots.map(s => {
        const isPreselected = window._preselectedSlot && s.start_time === window._preselectedSlot;
        const isSelected = isPreselected || (!s.available && !isPreselected);
        return `<button
          type="button"
          class="slot-btn${isPreselected ? ' selected' : (!s.available ? ' selected' : '')}"
          data-start="${s.start_time}"
          ${(!s.available && !isPreselected) ? 'disabled' : ''}
        >${s.start_time}</button>`;
      }).join('');

      // If there's a pre-selected slot, mark it as selected visually
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
      slotsGrid.innerHTML = '<div class="empty">Error cargando horarios. Recarga la página.</div>';
    }
  }

  // Auto-select first service
  if (serviceSelect.options.length > 0) {
    selectedServiceId = serviceSelect.value;
  }

  // Pre-select date/slot on edit page (set by template via window._preselectedDate/Slot)
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

document.addEventListener('DOMContentLoaded', initBooking);

// ── Admin: confirm before status change ───────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-confirm]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!confirm(btn.dataset.confirm)) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  });
});
