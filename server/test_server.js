require('dotenv').config();
const { generateColdEmail, getProfile } = require('./services/aiService');
const { saveToGmailDrafts } = require('./services/gmailService');

async function runTest() {
  console.log('Testing PostGrab with Ravi Gagiya\'s Resume & Real Credentials...\n');

  const profile = getProfile();
  console.log(`Loaded Profile for: ${profile.fullName} (${profile.title})`);
  console.log(`Phone: ${profile.phone}, Email: ${profile.contactEmail}`);

  // Test 1: ERP Job Post
  console.log('\n================== TEST 1: ERP Job Post ==================');
  const erpPost = {
    id: 'post-erp-1',
    author: 'Vikram Mehta',
    email: 'careers@logisticsflow.in',
    content: 'We need an experienced Node.js & MySQL developer to work on our supply chain ERP system. Must have experience with invoicing, database schema design, and inventory workflows.'
  };
  const email1 = await generateColdEmail(erpPost);
  console.log(`Subject: ${email1.subject}`);
  console.log(`\nEmail Body:\n------------------------------------\n${email1.body}\n------------------------------------`);

  // Test 2: Real-time / Live Streaming Job Post
  console.log('\n================== TEST 2: Real-Time / WebRTC Post ==================');
  const streamingPost = {
    id: 'post-stream-2',
    author: 'Sarah Lin',
    email: 'sarah@streamlive.io',
    content: 'Hiring a Senior Backend Engineer for our audio/video streaming app. Needs deep knowledge of WebRTC, Socket.IO, and scalable media servers.'
  };
  const email2 = await generateColdEmail(streamingPost);
  console.log(`Subject: ${email2.subject}`);
  console.log(`\nEmail Body:\n------------------------------------\n${email2.body}\n------------------------------------`);

  // Test 3: Test Gmail Draft with Attachment (Live test with the user's configured credentials)
  console.log('\n================== TEST 3: Saving to Gmail Drafts ==================');
  const draftResult = await saveToGmailDrafts({
    to: erpPost.email,
    subject: email1.subject,
    body: email1.body
  });
  console.log('Draft Result:', draftResult);

  console.log('\nAll tests completed!');
}

runTest().catch(err => {
  console.error('Test Execution Error:', err);
  process.exit(1);
});
