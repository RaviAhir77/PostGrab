const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const { generateColdEmail, getProfile } = require('./services/aiService');
const { saveToGmailDrafts } = require('./services/gmailService');

const app = express();
const PORT = process.env.PORT || 3000;
const PROFILE_PATH = path.join(__dirname, 'profile.json');

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '1mb' }));

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  const hasGmailUser = Boolean(process.env.GMAIL_USER);
  const hasGmailPass = Boolean(process.env.GMAIL_APP_PASSWORD);
  const isDryRun = process.env.DRY_RUN === 'true';

  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    gmailConfigured: hasGmailUser && hasGmailPass,
    dryRunMode: isDryRun,
    aiEndpoint: process.env.AI_ENDPOINT || 'http://localhost:11434/api/generate'
  });
});

// Get Candidate Profile
app.get('/api/profile', (req, res) => {
  try {
    const profile = getProfile();
    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update Candidate Profile
app.post('/api/profile', (req, res) => {
  try {
    const newProfile = req.body;
    if (!newProfile || typeof newProfile !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid profile data' });
    }
    fs.writeFileSync(PROFILE_PATH, JSON.stringify(newProfile, null, 2), 'utf-8');
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Main Endpoint: Generate Cold Email & Save to Gmail Drafts
app.post('/api/create-draft', async (req, res) => {
  try {
    const { post } = req.body;

    if (!post || !post.content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: post.content'
      });
    }

    console.log(`\n========================================`);
    console.log(`[Draft Request] Post Author: ${post.author || 'Unknown'}`);
    console.log(`[Draft Request] Recipient Email: ${post.email || '[None in post, draft saved for manual review]'}`);
    console.log(`[Draft Request] Content Snippet: ${post.content.slice(0, 100).replace(/\n/g, ' ')}...`);

    // 1. Generate Email (via local LLM or smart template)
    const emailData = await generateColdEmail(post);
    console.log(`[Draft Request] Generated Subject: "${emailData.subject}"`);

    // 2. Save into Gmail Drafts folder
    const draftResult = await saveToGmailDrafts({
      to: post.email || undefined,
      subject: emailData.subject,
      body: emailData.body
    });

    console.log(`[Draft Request] Success! Saved to: ${draftResult.mailbox}`);
    console.log(`========================================\n`);

    res.json({
      success: true,
      subject: emailData.subject,
      recipient: post.email || null,
      generator: emailData.generator,
      draftId: draftResult.draftId,
      mailbox: draftResult.mailbox,
      dryRun: Boolean(draftResult.dryRun),
      bodyPreview: emailData.body.slice(0, 200) + '...'
    });
  } catch (err) {
    console.error(`[Draft Request Error]`, err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`-----------------------------------------------------`);
  console.log(`🚀 PostGrab Auto-Draft Server running on http://localhost:${PORT}`);
  console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`📝 Gmail User: ${process.env.GMAIL_USER || '[Not configured - see .env]'}`);
  console.log(`⚙️  Dry Run Mode: ${process.env.DRY_RUN === 'true' ? 'ENABLED (simulation mode)' : 'DISABLED (live IMAP)'}`);
  console.log(`-----------------------------------------------------`);
});
