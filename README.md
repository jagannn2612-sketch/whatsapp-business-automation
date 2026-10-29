# WhatsApp Business 3-Category Smart Automation System

This complete automation system connects directly to your WhatsApp account and handles incoming customer inquiries automatically across 3 categories:
1. 💄 **Makeup Order**
2. 👗 **Stitching Clothes**
3. 🥗 **Body Nutrition** (With urgent Advisor Callback alerts)

---

## 🚀 How to Run the Bot

1. Open your browser to: **[http://localhost:3000](http://localhost:3000)**
2. Scan the **QR Code** using WhatsApp on your phone:
   - Open WhatsApp on your phone.
   - Tap **Settings** (or **⋮ menu** on Android) > **Linked Devices**.
   - Tap **Link a Device** and scan the QR code shown on the dashboard.
3. Once connected, the dashboard will turn green: `🟢 Connected`!

To start the bot in the future:
- Double click **`start_bot.bat`** in `D:\jagan ai\`.

---

## 🤖 How the Customer Workflow Operates

### 1. Welcome Greeting
When a customer messages `Hi`, `Hello`, or anything, the bot immediately greets them:
```text
🌟 Welcome to Divine Glow & Wellness! 🌟

We are excited to assist you! Please reply with a number to select what you need:

1️⃣ 💄 Makeup Order
2️⃣ 👗 Stitching Clothes
3️⃣ 🥗 Body Nutrition

👉 Reply with 1, 2, or 3 to get started!
```

---

### 2. Category 1: Makeup Order (Reply `1`)
- **Bot prompts:**
  - Event Date & Time
  - Makeup Style (Bridal / Party / Haldi / Photoshoot)
  - Service Location (Home Service or Studio Visit)
  - Number of Persons
- **Customer replies:**
  - System logs inquiry under **"Makeup Orders"**.
  - Sends a confirmation: *"Thank you! Our beauty specialist will review and contact you shortly."*

---

### 3. Category 2: Stitching Clothes (Reply `2`)
- **Bot prompts:**
  - Outfit Type (Blouse, Salwar, Gown, Kurti, etc.)
  - Fabric status (Cloth ready or needs sourcing)
  - Required Delivery Date
  - Special design requests or sample photo
- **Customer replies:**
  - System records inquiry under **"Stitching Clothes"**.
  - Sends confirmation: *"Got it! Our master tailor will review and send you a quotation shortly."*

---

### 4. Category 3: Body Nutrition & Advisor Callback (Reply `3`)
- **Bot presents 2 choices:**
  - **A:** 📞 Speak directly with our Nutrition Advisor
  - **B:** 📋 View Diet Plans & Pricing
- **If customer chooses A (Advisor Call):**
  - Bot asks for: **Full Name**, **Best phone number**, **Convenient call time**, and **Health goal**.
  - **Instant Multi-Channel Alert Triggered:**
    1. 🚨 **Dashboard Alert**: Flashes a prominent red banner and plays an audible alert chime!
    2. 🚨 **Direct WhatsApp Alert to Owner**: If you enter your phone number in the Settings tab, the bot sends an instant WhatsApp message straight to your phone saying:
       > *"URGENT NOTIFICATION: Nutrition Advisor Call Request! Client: [Name], Phone: [Number], Time: [Time]. Please call them ASAP!"*
    3. 🚨 **Pending Queue**: Adds customer to the top of your callback list with a one-click `📞 Call` button.

---

## 📊 Dashboard Features

- **Live Inquiries Table**: Filter by All, Advisor Calls, Makeup, or Stitching.
- **Status Tracker**: Update status to `New`, `Called`, or `Completed`.
- **Export to Excel**: Click **📥 Export to Excel (CSV)** to download your customer leads.
- **Customizable Messages**: Change greeting text, questions, and replies anytime in the **Bot Automation Settings** tab.
- **Live Feed**: Watch chats happening in real time.
