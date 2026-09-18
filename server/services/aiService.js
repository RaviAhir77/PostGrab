const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, '..', 'profile.json');

/**
 * Load candidate profile from profile.json
 */
function getProfile() {
  try {
    const raw = fs.readFileSync(PROFILE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[AI Service] Could not read profile.json, using defaults:', err.message);
    return {
      fullName: 'Ravi Gagiya',
      title: 'Full Stack Developer',
      phone: '+91 7096206404',
      contactEmail: 'ravigagiya.cse@gmail.com',
      linkedinUrl: 'https://linkedin.com/in/ravigagiya',
      githubUrl: 'https://github.com/RaviAhir77'
    };
  }
}

/**
 * Extract recipient's first name from post author
 */
function extractFirstName(author) {
  if (!author || author === 'LinkedIn Member' || author.toLowerCase().includes('recruiter') || author.toLowerCase().includes('hiring')) {
    return 'there';
  }
  const clean = author.replace(/^(dr\.|mr\.|ms\.|mrs\.)\s+/i, '').trim();
  const parts = clean.split(/\s+/);
  return parts[0] || 'there';
}

/**
 * Extract matched skills and determine the best matching project from Ravi's resume
 */
function matchResumeHighlights(content, profile) {
  const text = (content || '').toLowerCase();

  // Role detection
  const roleMatch = content.match(/(?:hiring|looking for|seeking|open position for|need a|opening for)\s+(?:an?\s+)?([A-Za-z0-9\s-]{3,35}?(?:developer|engineer|lead|architect|specialist|intern))/i);
  let likelyRole = roleMatch ? roleMatch[1].trim() : '';

  // Theme matching
  const hasERP = /erp|import|export|invoice|billing|inventory|accounting|gst|compliance/i.test(text);
  const hasRealtime = /webrtc|livekit|agora|stream|video|audio|socket\.?io|chat|messaging/i.test(text);
  const hasMobile = /react native|mobile|android|ios|app developer/i.test(text);
  const hasCloudDevOps = /docker|linux|nginx|pm2|cloudflare|vps|deployment|devops/i.test(text);
  const hasReactNode = /react|node|express|javascript|typescript|full stack|fullstack|frontend|backend/i.test(text);

  let relevantExperienceSnippet = '';

  if (hasERP) {
    if (!likelyRole) likelyRole = 'Full Stack / ERP Developer';
    relevantExperienceSnippet = `Currently at Thinkersky Technology, I develop on a large-scale Import & Export ERP platform with Node.js and MySQL (180+ relational tables), automating e-Invoicing, e-Way Bills, and scaling complex forms from 50 to 800+ items. I also architected Pragyaan ERP, a full-stack system with React, Node.js, and automated PDF quotation/invoice generation.`;
  } else if (hasRealtime) {
    if (!likelyRole) likelyRole = 'Real-Time / Full Stack Engineer';
    relevantExperienceSnippet = `I have extensive hands-on experience building low-latency real-time applications, including JAM (a live video streaming and audio room platform where I migrated infrastructure from Agora to self-hosted LiveKit, reducing costs by 80%) as well as WebRTC voice/video chat and Socket.IO multiplayer systems.`;
  } else if (hasMobile) {
    if (!likelyRole) likelyRole = 'React Native / Mobile Developer';
    relevantExperienceSnippet = `I developed the Dairy Agent mobile application using React Native, TypeScript, Node.js, and Prisma ORM, implementing shift-wise delivery tracking, role-based workflows, and automated invoice collections on production Linux VPS.`;
  } else if (hasCloudDevOps) {
    if (!likelyRole) likelyRole = 'Full Stack / Backend Engineer';
    relevantExperienceSnippet = `I have strong production deployment and DevOps experience managing self-hosted Linux VPS environments with Docker, Nginx reverse proxy, PM2, and Cloudflare services (Workers, R2, D1), building highly resilient REST APIs with Node.js and PostgreSQL.`;
  } else {
    if (!likelyRole) likelyRole = 'Full Stack Developer';
    relevantExperienceSnippet = `I bring 2+ years of full-stack engineering experience building robust web applications with Node.js, React.js, Express, PostgreSQL, MongoDB, and MySQL—specializing in clean API design, database architecture, and production deployment on Linux VPS.`;
  }

  return { likelyRole, relevantExperienceSnippet };
}

/**
 * Intelligent Generator: synthesizes a human, professional cold email using Ravi's real resume data
 */
function generateTemplateEmail(post, profile) {
  const firstName = extractFirstName(post.author);
  const { likelyRole, relevantExperienceSnippet } = matchResumeHighlights(post.content, profile);

  const subject = `Application for ${likelyRole} - ${profile.fullName}`;

  const body = [
    `Hi ${firstName},`,
    '',
    `I saw your recent LinkedIn post regarding ${likelyRole} and wanted to reach out directly. With 2+ years of production experience developing scalable web applications using Node.js, React.js, Express, PostgreSQL, and MongoDB, I would love to contribute to your team.`,
    '',
    relevantExperienceSnippet,
    '',
    `I have attached my updated resume for your quick review.`,
    '',
    `Are you open for a brief 10-minute introductory call this week to discuss how I can add immediate value to your project?`,
    '',
    `Best regards,`,
    `${profile.fullName}`,
    `${profile.title} | ${profile.location}`,
    `Phone: ${profile.phone}`,
    `Email: ${profile.contactEmail}`,
    `LinkedIn: ${profile.linkedinUrl}`,
    `GitHub: ${profile.githubUrl}`
  ].join('\n');

  return {
    subject,
    body,
    generator: 'resume-matched-template'
  };
}

/**
 * Attempt to query local LLM (Ollama or OpenCode HTTP server) if active
 */
async function queryLocalLLM(post, profile) {
  const endpoint = process.env.AI_ENDPOINT || 'http://localhost:11434/api/generate';
  const model = process.env.AI_MODEL || 'llama3';

  const systemPrompt = `You are an executive cold email coach representing software engineer Ravi Gagiya.
Write a personalized, concise, high-impact cold outreach email to the LinkedIn poster.

Candidate Resume Profile:
- Name: ${profile.fullName}
- Title: ${profile.title}
- Experience: ${profile.yearsOfExperience}
- Skills: ${JSON.stringify(profile.technicalSkills)}
- Notable Projects: ${JSON.stringify(profile.notableProjects)}
- Guidelines: ${(profile.guidelines || []).join('; ')}

Post Details:
- Poster / Author: ${post.author || 'Hiring Manager'}
- Post Text:
${post.content}

Instructions:
1. Reference the exact requirements in the post.
2. Highlight 1-2 directly matching projects from Ravi's real experience (e.g. ERP platforms, LiveKit WebRTC cost reduction, Dairy Agent React Native, or high-performance Node.js/React APIs).
3. Mention that Ravi's resume is attached.
4. End with phone (+91 7096206404), email (${profile.contactEmail}), LinkedIn, and GitHub in signature.
5. Return JSON format ONLY:
{
  "subject": "Compelling subject line",
  "body": "Complete cold email text"
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: systemPrompt,
        stream: false,
        format: 'json'
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!res.ok) throw new Error(`LLM endpoint returned status ${res.status}`);

    const data = await res.json();
    const rawResponse = data.response || data.text || '';
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.subject && parsed.body) {
        return {
          subject: parsed.subject,
          body: parsed.body,
          generator: `local-llm (${model})`
        };
      }
    }
    throw new Error('LLM output format not JSON');
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Main AI Generation Entry Point
 */
async function generateColdEmail(post) {
  const profile = getProfile();

  try {
    const aiResult = await queryLocalLLM(post, profile);
    console.log(`[AI Service] Generated email via ${aiResult.generator}`);
    return aiResult;
  } catch (err) {
    console.log(`[AI Service] Using resume-matched generator (${err.message})`);
    return generateTemplateEmail(post, profile);
  }
}

module.exports = {
  generateColdEmail,
  getProfile
};
