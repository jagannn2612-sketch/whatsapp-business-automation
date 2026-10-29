// WhatsApp Automation Dashboard Frontend Logic
const socket = io();

// State
let allLeads = [];
let activeFilter = 'ALL';
let searchQuery = '';
let currentSettings = {};

// DOM Elements
const connectionBadge = document.getElementById('connectionBadge');
const connectionText = document.getElementById('connectionText');
const qrSection = document.getElementById('qrSection');
const qrImage = document.getElementById('qrImage');
const urgentAlertBanner = document.getElementById('urgentAlertBanner');
const urgentClientDetails = document.getElementById('urgentClientDetails');
const urgentCallBtn = document.getElementById('urgentCallBtn');
const dismissAlertBtn = document.getElementById('dismissAlertBtn');

const totalLeadsCount = document.getElementById('totalLeadsCount');
const urgentLeadsCount = document.getElementById('urgentLeadsCount');
const makeupCount = document.getElementById('makeupCount');
const stitchingCount = document.getElementById('stitchingCount');

const leadsTableBody = document.getElementById('leadsTableBody');
const noLeadsPlaceholder = document.getElementById('noLeadsPlaceholder');
const searchInput = document.getElementById('searchInput');
const liveFeedContainer = document.getElementById('liveFeedContainer');

// Sound Synthesizer via Web Audio API (Guaranteed offline and instant)
let audioCtx = null;
function playChime(urgent = false) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (urgent) {
      // High alert chime: 3 rapid rising tones
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.12); // A5
      osc.frequency.setValueAtTime(1174.66, now + 0.24); // D6

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

      osc.start(now);
      osc.stop(now + 0.6);
    } else {
      // Normal chime
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.15); // E5

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
}

// Socket.io Events
socket.on('connection_status', (data) => {
  updateConnectionUI(data);
});

socket.on('new_lead', (lead) => {
  allLeads.unshift(lead);
  renderStats();
  renderLeads();
  playChime(lead.priority === 'URGENT');
});

socket.on('lead_updated', (updated) => {
  const index = allLeads.findIndex((l) => l.id === updated.id);
  if (index !== -1) {
    allLeads[index] = updated;
    renderStats();
    renderLeads();
  }
});

socket.on('leads_refreshed', () => {
  fetchLeads();
});

socket.on('urgent_advisor_alert', (lead) => {
  showUrgentBanner(lead);
  playChime(true);
});

socket.on('chat_activity', (chat) => {
  addLiveFeedItem(chat);
});

function showUrgentBanner(lead) {
  urgentClientDetails.textContent = `${lead.customerName || 'Customer'} (+${lead.customerPhone}): "${lead.details.substring(0, 70)}..."`;
  urgentCallBtn.href = `tel:+${lead.customerPhone}`;
  urgentAlertBanner.classList.remove('hidden');
}

dismissAlertBtn.addEventListener('click', () => {
  urgentAlertBanner.classList.add('hidden');
});

// Update Connection UI
function updateConnectionUI(data) {
  const status = data.status;

  connectionBadge.className = 'status-badge ' + status;

  if (status === 'connected') {
    connectionText.textContent = `🟢 Connected (${data.user || 'WhatsApp'})`;
    qrSection.classList.add('hidden');
  } else if (status === 'qr_ready') {
    connectionText.textContent = '🟡 Scan QR Code to Link';
    if (data.qr) {
      qrImage.src = data.qr;
      qrSection.classList.remove('hidden');
    }
  } else if (status === 'connecting') {
    connectionText.textContent = '🔄 Initializing WhatsApp...';
  } else {
    connectionText.textContent = '🔴 Disconnected';
  }
}

// Fetch Initial Status & Leads
async function init() {
  try {
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    updateConnectionUI(statusData);

    await fetchLeads();
    await fetchSettings();
  } catch (err) {
    console.error('Failed to init dashboard:', err);
  }
}

async function fetchLeads() {
  try {
    const res = await fetch('/api/leads');
    allLeads = await res.json();
    renderStats();
    renderLeads();
  } catch (err) {
    console.error('Failed to fetch leads:', err);
  }
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    currentSettings = await res.json();
    populateSettingsForm(currentSettings);
  } catch (err) {
    console.error('Failed to fetch settings:', err);
  }
}

// Render Stats Counters
function renderStats() {
  totalLeadsCount.textContent = allLeads.length;

  const urgentList = allLeads.filter(
    (l) => l.category === 'Nutrition Advisor Call' && l.status === 'New'
  );
  urgentLeadsCount.textContent = urgentList.length;

  const makeupList = allLeads.filter((l) => l.category === 'Makeup Order');
  makeupCount.textContent = makeupList.length;

  const stitchingList = allLeads.filter((l) => l.category === 'Stitching Clothes');
  stitchingCount.textContent = stitchingList.length;

  // Pulse effect on urgent card if there are pending advisor calls
  const urgentCard = document.getElementById('urgentStatCard');
  if (urgentList.length > 0) {
    urgentCard.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
  } else {
    urgentCard.style.boxShadow = 'none';
  }
}

// Render Table
function renderLeads() {
  let filtered = allLeads;

  if (activeFilter !== 'ALL') {
    filtered = filtered.filter((l) => l.category === activeFilter);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(
      (l) =>
        (l.customerName && l.customerName.toLowerCase().includes(q)) ||
        (l.customerPhone && l.customerPhone.includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q))
    );
  }

  leadsTableBody.innerHTML = '';

  if (filtered.length === 0) {
    noLeadsPlaceholder.classList.remove('hidden');
    return;
  }
  noLeadsPlaceholder.classList.add('hidden');

  filtered.forEach((lead) => {
    const tr = document.createElement('tr');
    if (lead.priority === 'URGENT' && lead.status === 'New') {
      tr.classList.add('row-urgent');
    }

    const dateFormatted = new Date(lead.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Category styling
    let catClass = 'badge-cat';
    let catIcon = '📋';
    if (lead.category === 'Nutrition Advisor Call') {
      catClass += ' urgent';
      catIcon = '🚨';
    } else if (lead.category === 'Makeup Order') {
      catClass += ' makeup';
      catIcon = '💄';
    } else if (lead.category === 'Stitching Clothes') {
      catClass += ' stitching';
      catIcon = '👗';
    }

    tr.innerHTML = `
      <td>
        <div class="customer-cell">
          <span class="customer-name">${escapeHtml(lead.customerName || 'Customer')}</span>
          <span class="customer-phone">+${escapeHtml(lead.customerPhone)}</span>
        </div>
      </td>
      <td>
        <span class="${catClass}">${catIcon} ${escapeHtml(lead.category)}</span>
      </td>
      <td>
        <div class="inquiry-details">${escapeHtml(lead.details)}</div>
      </td>
      <td>
        <span class="inquiry-date">${dateFormatted}</span>
      </td>
      <td>
        <select class="status-select ${lead.status}" data-id="${lead.id}">
          <option value="New" ${lead.status === 'New' ? 'selected' : ''}>⏳ New</option>
          <option value="Called" ${lead.status === 'Called' ? 'selected' : ''}>📞 Called</option>
          <option value="Completed" ${lead.status === 'Completed' ? 'selected' : ''}>✅ Completed</option>
        </select>
      </td>
      <td>
        <div class="action-buttons">
          <a href="tel:+${lead.customerPhone}" class="btn-icon" title="Call directly">📞</a>
          <a href="https://wa.me/${lead.customerPhone}" target="_blank" class="btn-icon" title="Open WhatsApp Chat">💬</a>
          <button class="btn-icon delete" data-delete-id="${lead.id}" title="Delete Lead">🗑️</button>
        </div>
      </td>
    `;

    leadsTableBody.appendChild(tr);
  });
}

// Table Interactions
leadsTableBody.addEventListener('change', async (e) => {
  if (e.target.classList.contains('status-select')) {
    const id = e.target.getAttribute('data-id');
    const newStatus = e.target.value;
    try {
      await fetch(`/api/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }
});

leadsTableBody.addEventListener('click', async (e) => {
  const delBtn = e.target.closest('[data-delete-id]');
  if (delBtn) {
    const id = delBtn.getAttribute('data-delete-id');
    if (confirm('Are you sure you want to delete this inquiry?')) {
      try {
        await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error('Failed to delete lead:', err);
      }
    }
  }
});

// Filter Pills
document.querySelectorAll('.filter-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    activeFilter = pill.getAttribute('data-filter');
    renderLeads();
  });
});

// Search Filter
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderLeads();
});

// Tab Switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach((p) => p.classList.remove('active'));

    btn.classList.add('active');
    const target = btn.getAttribute('data-tab');
    document.getElementById(target).classList.add('active');
  });
});

// Live Feed Log
function addLiveFeedItem(chat) {
  const empty = liveFeedContainer.querySelector('.empty-feed');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${chat.direction}`;

  const timeStr = new Date(chat.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  bubble.innerHTML = `
    <div class="bubble-meta">
      <strong>${chat.direction === 'incoming' ? `👤 ${chat.pushName} (+${chat.senderPhone})` : '🤖 Auto-Reply Bot'}</strong>
      <span>${timeStr}</span>
    </div>
    <div class="bubble-text">${escapeHtml(chat.text)}</div>
  `;

  liveFeedContainer.prepend(bubble);
}

// Settings Form Handling
function populateSettingsForm(s) {
  if (s.businessName) {
    document.getElementById('businessName').value = s.businessName;
    document.getElementById('brandTitle').textContent = s.businessName;
  }
  if (s.ownerPhoneNumber) document.getElementById('ownerPhoneNumber').value = s.ownerPhoneNumber;
  if (s.greetingMessage) document.getElementById('greetingMessage').value = s.greetingMessage;
  if (s.makeupPrompt) document.getElementById('makeupPrompt').value = s.makeupPrompt;
  if (s.makeupThanks) document.getElementById('makeupThanks').value = s.makeupThanks;
  if (s.stitchingPrompt) document.getElementById('stitchingPrompt').value = s.stitchingPrompt;
  if (s.stitchingThanks) document.getElementById('stitchingThanks').value = s.stitchingThanks;
  if (s.nutritionMenu) document.getElementById('nutritionMenu').value = s.nutritionMenu;
  if (s.nutritionAdvisorPrompt) document.getElementById('nutritionAdvisorPrompt').value = s.nutritionAdvisorPrompt;
  if (s.nutritionAdvisorThanks) document.getElementById('nutritionAdvisorThanks').value = s.nutritionAdvisorThanks;
  if (s.nutritionPlansText) document.getElementById('nutritionPlansText').value = s.nutritionPlansText;
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const saveStatus = document.getElementById('saveStatus');
  saveStatus.textContent = 'Saving...';
  saveStatus.className = 'save-status';

  const updated = {
    businessName: document.getElementById('businessName').value.trim(),
    ownerPhoneNumber: document.getElementById('ownerPhoneNumber').value.trim(),
    greetingMessage: document.getElementById('greetingMessage').value,
    makeupPrompt: document.getElementById('makeupPrompt').value,
    makeupThanks: document.getElementById('makeupThanks').value,
    stitchingPrompt: document.getElementById('stitchingPrompt').value,
    stitchingThanks: document.getElementById('stitchingThanks').value,
    nutritionMenu: document.getElementById('nutritionMenu').value,
    nutritionAdvisorPrompt: document.getElementById('nutritionAdvisorPrompt').value,
    nutritionAdvisorThanks: document.getElementById('nutritionAdvisorThanks').value,
    nutritionPlansText: document.getElementById('nutritionPlansText').value
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    });
    const data = await res.json();
    if (data.success) {
      saveStatus.textContent = '✅ Settings saved successfully!';
      saveStatus.className = 'save-status success';
      document.getElementById('brandTitle').textContent = updated.businessName || 'WhatsApp Automation';
      setTimeout(() => { saveStatus.textContent = ''; }, 3500);
    }
  } catch (err) {
    saveStatus.textContent = '❌ Failed to save settings';
    saveStatus.className = 'save-status error';
  }
});

// Quick Action Buttons
document.getElementById('restartBtn').addEventListener('click', async () => {
  if (confirm('Restart WhatsApp bot service?')) {
    await fetch('/api/restart', { method: 'POST' });
  }
});

document.getElementById('disconnectBtn').addEventListener('click', async () => {
  if (confirm('Unlink device and generate a fresh QR code?')) {
    await fetch('/api/disconnect', { method: 'POST' });
  }
});

document.getElementById('testAudioBtn').addEventListener('click', () => {
  playChime(true);
});

// Utility
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// PWA Installation & Service Worker
let deferredPrompt;
const installAppBtn = document.getElementById('installAppBtn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installAppBtn) installAppBtn.classList.remove('hidden');
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installAppBtn.classList.add('hidden');
      }
      deferredPrompt = null;
    }
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => {
    console.log('SW registration note:', err);
  });
}

// Start
init();
