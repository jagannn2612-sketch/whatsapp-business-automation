const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const pino = require('pino');
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const AUTH_DIR = process.env.AUTH_DIR || path.join(__dirname, 'auth_info_baileys');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Load Helpers
function getSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (err) {
    return {};
  }
}

function saveSettings(settings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
}

function getLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2), 'utf8');
}

function addLead(leadData) {
  const leads = getLeads();
  const newLead = {
    id: 'LEAD_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    timestamp: new Date().toISOString(),
    status: 'New',
    ...leadData
  };
  leads.unshift(newLead);
  saveLeads(leads);
  io.emit('new_lead', newLead);
  return newLead;
}

// User Conversation State Tracking
// senderJid -> { step: 'IDLE' | 'WAITING_MAKEUP' | 'WAITING_STITCHING' | 'NUTRITION_MENU' | 'WAITING_NUTRITION_ADVISOR', lastActive: timestamp }
const userSessions = new Map();

// WhatsApp Connection State
let sock = null;
let connectionStatus = 'disconnected'; // 'connecting', 'qr_ready', 'connected', 'disconnected'
let currentQR = null;
let connectedUser = null;

async function startWhatsApp() {
  try {
    connectionStatus = 'connecting';
    io.emit('connection_status', { status: connectionStatus });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      auth: state,
      printQRInTerminal: false,
      browser: ['Divine Business Bot', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = await QRCode.toDataURL(qr);
        connectionStatus = 'qr_ready';
        io.emit('connection_status', {
          status: connectionStatus,
          qr: currentQR
        });
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'disconnected';
        currentQR = null;
        connectedUser = null;

        io.emit('connection_status', {
          status: connectionStatus,
          reason: lastDisconnect?.error?.message || 'Connection closed'
        });

        if (shouldReconnect) {
          console.log('Reconnecting WhatsApp...');
          setTimeout(startWhatsApp, 3000);
        } else {
          console.log('Logged out. Please re-scan QR code.');
          if (fs.existsSync(AUTH_DIR)) {
            fs.rmSync(AUTH_DIR, { recursive: true, force: true });
          }
          setTimeout(startWhatsApp, 2000);
        }
      } else if (connection === 'open') {
        connectionStatus = 'connected';
        currentQR = null;
        connectedUser = sock.user ? sock.user.id.split(':')[0] : 'Connected';

        console.log(`WhatsApp connected successfully as: ${connectedUser}`);
        io.emit('connection_status', {
          status: connectionStatus,
          user: connectedUser
        });
      }
    });

    // Handle Incoming Messages
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const senderJid = msg.key.remoteJid;
        // Skip status updates or group chats if you only want personal chats
        if (senderJid.endsWith('@g.us') || senderJid.endsWith('@broadcast')) continue;

        const senderPhone = senderJid.replace('@s.whatsapp.net', '');
        const pushName = msg.pushName || 'Valued Customer';

        // Extract message text
        const text = (
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          ''
        ).trim();

        if (!text) continue;

        // Log message for real-time dashboard activity
        io.emit('chat_activity', {
          senderPhone,
          pushName,
          text,
          timestamp: new Date().toISOString(),
          direction: 'incoming'
        });

        await handleCustomerWorkflow(senderJid, senderPhone, pushName, text);
      }
    });
  } catch (err) {
    console.error('Error starting WhatsApp connection:', err);
    connectionStatus = 'disconnected';
    io.emit('connection_status', { status: connectionStatus, error: err.message });
  }
}

// Conversation Bot Workflow
async function handleCustomerWorkflow(jid, phone, pushName, text) {
  const settings = getSettings();
  const lower = text.toLowerCase().trim();

  let session = userSessions.get(jid) || { step: 'IDLE' };

  // Global reset commands
  if (['hi', 'hello', 'hey', 'start', 'menu', 'reset', 'options', 'help'].includes(lower)) {
    session.step = 'MENU';
    userSessions.set(jid, session);
    await sendReply(jid, settings.greetingMessage);
    return;
  }

  switch (session.step) {
    case 'MENU':
    case 'IDLE':
      if (lower === '1' || lower.includes('makeup')) {
        session.step = 'WAITING_MAKEUP';
        userSessions.set(jid, session);
        await sendReply(jid, settings.makeupPrompt);
      } else if (lower === '2' || lower.includes('stitching') || lower.includes('cloth')) {
        session.step = 'WAITING_STITCHING';
        userSessions.set(jid, session);
        await sendReply(jid, settings.stitchingPrompt);
      } else if (lower === '3' || lower.includes('nutrition') || lower.includes('body')) {
        session.step = 'NUTRITION_MENU';
        userSessions.set(jid, session);
        await sendReply(jid, settings.nutritionMenu);
      } else {
        // Did not match 1, 2, or 3
        await sendReply(
          jid,
          `Sorry, I didn't recognize that option. 😊\n\n${settings.greetingMessage}`
        );
        session.step = 'MENU';
        userSessions.set(jid, session);
      }
      break;

    case 'WAITING_MAKEUP':
      // Customer provided makeup order details
      addLead({
        customerName: pushName,
        customerPhone: phone,
        category: 'Makeup Order',
        priority: 'Normal',
        details: text
      });

      session.step = 'IDLE';
      userSessions.set(jid, session);
      await sendReply(jid, settings.makeupThanks);
      break;

    case 'WAITING_STITCHING':
      // Customer provided stitching order details
      addLead({
        customerName: pushName,
        customerPhone: phone,
        category: 'Stitching Clothes',
        priority: 'Normal',
        details: text
      });

      session.step = 'IDLE';
      userSessions.set(jid, session);
      await sendReply(jid, settings.stitchingThanks);
      break;

    case 'NUTRITION_MENU':
      if (lower === 'a' || lower.includes('talk') || lower.includes('advisor') || lower.includes('call') || lower === '1') {
        session.step = 'WAITING_NUTRITION_ADVISOR';
        userSessions.set(jid, session);
        await sendReply(jid, settings.nutritionAdvisorPrompt);
      } else if (lower === 'b' || lower.includes('plan') || lower.includes('diet') || lower === '2') {
        await sendReply(jid, settings.nutritionPlansText);
        // Remain in NUTRITION_MENU so they can still reply A to schedule a call
      } else {
        await sendReply(
          jid,
          `Please reply with *A* to talk to our Nutrition Advisor, or *B* to view diet plans.`
        );
      }
      break;

    case 'WAITING_NUTRITION_ADVISOR':
      // Customer provided contact info & preferred call time
      const urgentLead = addLead({
        customerName: pushName,
        customerPhone: phone,
        category: 'Nutrition Advisor Call',
        priority: 'URGENT',
        details: text
      });

      // Emit high-priority real-time alert to web dashboard
      io.emit('urgent_advisor_alert', urgentLead);

      // If owner has configured their phone number, notify owner via WhatsApp immediately!
      if (settings.ownerPhoneNumber && settings.notifyOwnerOnCallRequest) {
        let cleanOwnerNumber = settings.ownerPhoneNumber.replace(/[^0-9]/g, '');
        if (cleanOwnerNumber.length > 0) {
          const ownerJid = `${cleanOwnerNumber}@s.whatsapp.net`;
          const alertMsg = `🚨 *URGENT NOTIFICATION: Nutrition Advisor Call Request!* 🚨\n\n👤 *Client:* ${pushName}\n📱 *WhatsApp Number:* +${phone}\n\n📝 *Client Requirements & Preferred Time:*\n"${text}"\n\n👉 *Please call this customer as soon as possible!*`;
          
          try {
            await sock.sendMessage(ownerJid, { text: alertMsg });
            console.log(`Alert sent to owner at ${cleanOwnerNumber}`);
          } catch (err) {
            console.error('Failed to send WhatsApp alert to owner:', err.message);
          }
        }
      }

      session.step = 'IDLE';
      userSessions.set(jid, session);
      await sendReply(jid, settings.nutritionAdvisorThanks);
      break;

    default:
      session.step = 'MENU';
      userSessions.set(jid, session);
      await sendReply(jid, settings.greetingMessage);
      break;
  }
}

async function sendReply(jid, message) {
  if (!sock) return;
  try {
    await sock.sendMessage(jid, { text: message });
    const senderPhone = jid.replace('@s.whatsapp.net', '');
    io.emit('chat_activity', {
      senderPhone,
      pushName: 'Bot',
      text: message,
      timestamp: new Date().toISOString(),
      direction: 'outgoing'
    });
  } catch (err) {
    console.error(`Failed to send reply to ${jid}:`, err.message);
  }
}

// REST APIs for Web Control Panel
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  const leads = getLeads();
  const pendingCalls = leads.filter(
    (l) => l.category === 'Nutrition Advisor Call' && l.status === 'New'
  ).length;

  res.json({
    status: connectionStatus,
    qr: currentQR,
    user: connectedUser,
    totalLeads: leads.length,
    pendingAdvisorCalls: pendingCalls
  });
});

app.get('/api/leads', (req, res) => {
  res.json(getLeads());
});

app.patch('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;
  const leads = getLeads();
  const lead = leads.find((l) => l.id === id);

  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  if (status) lead.status = status;
  if (notes !== undefined) lead.notes = notes;
  lead.updatedAt = new Date().toISOString();

  saveLeads(leads);
  io.emit('lead_updated', lead);
  res.json({ success: true, lead });
});

app.delete('/api/leads/:id', (req, res) => {
  const { id } = req.params;
  let leads = getLeads();
  leads = leads.filter((l) => l.id !== id);
  saveLeads(leads);
  io.emit('leads_refreshed');
  res.json({ success: true });
});

app.get('/api/settings', (req, res) => {
  res.json(getSettings());
});

app.post('/api/settings', (req, res) => {
  const newSettings = { ...getSettings(), ...req.body };
  saveSettings(newSettings);
  res.json({ success: true, settings: newSettings });
});

app.post('/api/restart', async (req, res) => {
  if (sock) {
    try {
      await sock.end();
    } catch (e) {}
  }
  startWhatsApp();
  res.json({ success: true, message: 'Restarting WhatsApp service...' });
});

app.post('/api/disconnect', async (req, res) => {
  if (sock) {
    try {
      await sock.logout();
    } catch (e) {}
  }
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  setTimeout(startWhatsApp, 1000);
  res.json({ success: true, message: 'Disconnected session and cleared auth.' });
});

// CSV Export
app.get('/api/export-leads', (req, res) => {
  const leads = getLeads();
  let csv = 'ID,Timestamp,Customer Name,Phone Number,Category,Priority,Status,Details,Notes\n';
  for (const l of leads) {
    const sanitize = (txt) => `"${(txt || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`;
    csv += [
      l.id,
      l.timestamp,
      sanitize(l.customerName),
      `'+${l.customerPhone}`,
      sanitize(l.category),
      l.priority,
      l.status,
      sanitize(l.details),
      sanitize(l.notes)
    ].join(',') + '\n';
  }

  res.header('Content-Type', 'text/csv');
  res.attachment(`whatsapp_leads_${Date.now()}.csv`);
  res.send(csv);
});

// Start Web Server & WhatsApp Worker
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(` WhatsApp Automation Dashboard Live at:`);
  console.log(` ➡️  http://localhost:${PORT}`);
  console.log(`===============================================`);
  startWhatsApp();
});
