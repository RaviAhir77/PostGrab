const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

/**
 * Build RFC 822 MIME message buffer using nodemailer with attachments support
 */
async function buildMimeMessage({ from, to, subject, body, attachments = [] }) {
  const transporter = nodemailer.createTransport({
    streamTransport: true,
    buffer: true
  });

  const mailOptions = {
    from: from,
    to: to || undefined,
    subject: subject,
    text: body,
    date: new Date(),
    attachments: attachments
  };

  const info = await transporter.sendMail(mailOptions);
  
  if (Buffer.isBuffer(info.message)) {
    return info.message;
  }

  const chunks = [];
  for await (const chunk of info.message) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Save an email as a Draft in the user's Gmail account via IMAP
 */
async function saveToGmailDrafts({ to, subject, body }) {
  const rawUser = process.env.GMAIL_USER || '';
  const rawPass = process.env.GMAIL_APP_PASSWORD || '';
  const user = rawUser.replace(/^["']|["']$/g, '').trim();
  const pass = rawPass.replace(/^["']|["']$/g, '').replace(/\s+/g, '').trim();
  const isDryRun = process.env.DRY_RUN === 'true';

  console.log(`[Gmail Service] Account: ${user || '[Not set]'}`);
  console.log(`[Gmail Service] Preparing draft for: ${to || '[No recipient specified - manual review in Gmail]'}`);
  console.log(`[Gmail Service] Subject: "${subject}"`);

  // Detect and attach candidate resume
  const attachments = [];
  const attachResume = process.env.ATTACH_RESUME !== 'false';
  if (attachResume) {
    const resumePath = path.resolve(__dirname, '..', process.env.RESUME_PATH || 'assets/Ravi_Gagiya_Resume.pdf');
    if (fs.existsSync(resumePath)) {
      attachments.push({
        filename: 'Ravi_Gagiya_Resume.pdf',
        path: resumePath
      });
      console.log(`[Gmail Service] Attached Resume: ${resumePath}`);
    } else {
      console.warn(`[Gmail Service] Resume file not found at: ${resumePath}`);
    }
  }

  // Dry run / simulation mode for local testing without Gmail credentials
  if (isDryRun) {
    console.log('[Gmail Service] DRY_RUN mode active: Simulated saving to Gmail Drafts successfully.');
    return {
      success: true,
      draftId: 'simulated-' + Date.now(),
      mailbox: '[Gmail]/Drafts (Simulated)',
      dryRun: true,
      attachedResume: attachments.length > 0
    };
  }

  if (!user || !pass) {
    console.warn('[Gmail Service] GMAIL_USER or GMAIL_APP_PASSWORD missing in .env');
    throw new Error(
      'Gmail credentials not configured. Please set GMAIL_USER and GMAIL_APP_PASSWORD in server/.env (or set DRY_RUN=true for testing).'
    );
  }

  // Connect to Gmail IMAP server
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: {
      user: user,
      pass: pass
    },
    logger: false
  });

  try {
    await client.connect();

    // Discover the exact drafts folder path in this Gmail account
    const mailboxes = await client.list();
    let draftsPath = '[Gmail]/Drafts';

    for (const mb of mailboxes) {
      if (mb.specialUse === '\\Drafts' || mb.path.toLowerCase().includes('draft')) {
        draftsPath = mb.path;
        break;
      }
    }

    // Compose raw MIME message with PDF attachment
    const rawMessage = await buildMimeMessage({
      from: user,
      to: to,
      subject: subject,
      body: body,
      attachments: attachments
    });

    // Append to Gmail Drafts folder with \Draft and \Seen flags
    const appendResult = await client.append(draftsPath, rawMessage, ['\\Draft', '\\Seen']);

    await client.logout();

    console.log(`[Gmail Service] Successfully saved to ${draftsPath} (UID: ${appendResult.uid || 'N/A'}) with ${attachments.length} attachment(s)`);

    return {
      success: true,
      draftId: appendResult.uid || Date.now(),
      mailbox: draftsPath,
      attachedResume: attachments.length > 0
    };
  } catch (err) {
    try {
      await client.logout();
    } catch (_) {}

    console.error('[Gmail Service] IMAP error:', err.message);

    if (err.message && err.message.includes('Authentication failed')) {
      throw new Error(
        'Gmail authentication failed. Make sure you are using a 16-character Google App Password (not your normal Gmail password). Enable 2-Step Verification in Google Account -> Security -> App Passwords.'
      );
    }

    throw new Error(`Gmail Draft creation failed: ${err.message}`);
  }
}

module.exports = {
  saveToGmailDrafts
};
