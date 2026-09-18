# PostGrab AI Draft Server (Node.js)

Automated Cold Email Generator and Gmail Drafts integration for the PostGrab LinkedIn extension.

---

## Features
- **One-Click Drafts**: Click `[ ✨ Draft ]` on any post in LinkedIn to generate an email and save it to your **Gmail Drafts** folder (`[Gmail]/Drafts`).
- **Human-in-the-Loop Safety**: Emails are saved as **Drafts**, never sent blindly. You have 100% control to review, edit, or send.
- **Candidate Profile Personalization**: Stored in `profile.json`, automatically matching your real skills, portfolio, and tone to the post requirements.
- **Multi-AI Support**:
  - Automatically detects local LLMs (Ollama / OpenCode) at `http://localhost:11434`.
  - Built-in **Smart Generator** fallback that extracts skills and writes crisp cold emails even if Ollama/OpenCode is offline.
- **Universal Portability**: Works on local machine (`http://localhost:3000`) and live server (`https://your-server.com`) without modifying extension code.

---

## 🚀 Quick Setup (Local)

### 1. Configure Candidate Profile
Open `profile.json` and customize your details:
```json
{
  "fullName": "Your Name",
  "title": "Full Stack Software Engineer",
  "contactEmail": "youremail@gmail.com",
  "phone": "+91 98765 43210",
  "linkedinUrl": "https://linkedin.com/in/yourprofile",
  "githubUrl": "https://github.com/yourusername",
  "yearsOfExperience": "4+",
  "coreSkills": ["JavaScript", "TypeScript", "Node.js", "React", "Python"]
}
```

### 2. Configure Gmail Credentials (`.env`)
1. Go to your **Google Account** > **Security** (`https://myaccount.google.com/security`).
2. Ensure **2-Step Verification** is turned ON.
3. Search for **App passwords** (or go to `https://myaccount.google.com/apppasswords`).
4. Create a new app password named `PostGrab`.
5. Copy the 16-character code and paste into `server/.env`:
```env
PORT=3000
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
DRY_RUN=false
```

*(Note: If `DRY_RUN=true`, the server runs in simulation mode for testing without requiring Gmail credentials).*

### 3. Start the Server
```bash
npm start
```
Or for auto-reload during development:
```bash
npm run dev
```

---

## 🌐 Deploying to Live Server (Later)
1. Copy the `server/` directory to your live VPS / server (Ubuntu/Debian).
2. Install dependencies:
   ```bash
   npm install --production
   ```
3. Create `.env` with your production `PORT` and Gmail App Password.
4. Run in background using PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name postgrab-server
   pm2 save
   ```
5. In your PostGrab extension, go to the **Export & Settings** tab, change the **AI Draft Server URL** to `https://your-server-domain.com`, and click **Save**.
