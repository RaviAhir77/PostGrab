const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

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
 * Extract role or key topic from post content
 */
function extractRoleFromPost(content) {
  if (!content) return 'Full Stack Developer';
  const roleMatch = content.match(/(?:hiring|looking for|seeking|open position for|need a|opening for)\s+(?:an?\s+)?([A-Za-z0-9\s-]{3,35}?(?:developer|engineer|lead|architect|specialist|intern))/i);
  if (roleMatch && roleMatch[1]) return roleMatch[1].trim();

  // Keyword role guesses based on post content
  const text = content.toLowerCase();
  if (text.includes('react native') || text.includes('mobile')) return 'React Native Developer';
  if (text.includes('backend') || text.includes('node')) return 'Backend / Node.js Developer';
  if (text.includes('frontend') || text.includes('react')) return 'Frontend / React Developer';
  if (text.includes('full stack') || text.includes('fullstack')) return 'Full Stack Developer';
  if (text.includes('devops') || text.includes('cloud')) return 'DevOps / Cloud Engineer';

  return 'this opportunity';
}

/**
 * Short & Sweet Template Generator (Fallback)
 * Under 50 words, based on the post content, NO lengthy resume dumping in the body.
 */
function generateTemplateEmail(post, profile) {
  const firstName = extractFirstName(post.author);
  const role = extractRoleFromPost(post.content);

  const subject = role !== 'this opportunity'
    ? `Regarding your post for ${role} - ${profile.fullName}`
    : `Regarding your LinkedIn post - ${profile.fullName}`;

  const body = [
    `Hi ${firstName},`,
    '',
    `I saw your post regarding ${role} and wanted to reach out. As a ${profile.title || 'Full Stack Developer'} with 2+ years of experience building modern web applications, I would love to contribute to your team.`,
    '',
    `I have attached my updated resume for your review.`,
    '',
    `Would you be open for a quick 5-minute chat this week?`,
    '',
    `Best regards,`,
    `${profile.fullName}`,
    `${profile.title}`,
    `Phone: ${profile.phone}`,
    `Email: ${profile.contactEmail}`,
    `LinkedIn: ${profile.linkedinUrl}`
  ].join('\n');

  return {
    subject,
    body,
    generator: 'short-and-sweet-template'
  };
}

/**
 * OpenCode CLI Generator
 * Runs `opencode run` locally on the server to synthesize a short, sweet cold email.
 */
async function queryOpenCodeCLI(post, profile) {
  return new Promise((resolve, reject) => {
    const role = extractRoleFromPost(post.content);
    const sanitizedPost = (post.content || '').slice(0, 600).replace(/["`$\\]/g, ' ');

    const prompt = `Write a very short, polite, and sweet cold email (under 50 words) to ${post.author || 'the hiring manager'} based on what they are looking for in their LinkedIn post.
IMPORTANT RULES:
1. Do NOT put resume project details, bullet points, or tech stack lists in the body.
2. Directly reference what their post is asking for.
3. State that you have 2+ years of full-stack engineering experience and would love to help.
4. Mention that Ravi Gagiya's updated resume is attached.
5. Ask for a quick 5-minute introductory call.
6. Sign off with:
Best regards,
Ravi Gagiya
Full Stack Developer
Phone: +91 7096206404
Email: ravigagiya.cse@gmail.com
LinkedIn: https://linkedin.com/in/ravigagiya

LinkedIn Post Content:
"${sanitizedPost}"

Return STRICT JSON format ONLY:
{
  "subject": "Regarding your post for ${role} - Ravi Gagiya",
  "body": "Hi [Name],\\n\\n[short email body]\\n\\nBest regards,\\nRavi Gagiya..."
}`;

    // Execute opencode run
    exec(`opencode run "${prompt.replace(/"/g, '\\"')}"`, { timeout: 18000 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`OpenCode execution failed: ${error.message}`));
      }

      const text = stdout || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.subject && parsed.body) {
            return resolve({
              subject: parsed.subject,
              body: parsed.body,
              generator: 'opencode-cli'
            });
          }
        } catch (_) {}
      }

      // If OpenCode returned plain text without JSON
      if (text.trim().length > 20) {
        const subjectMatch = text.match(/^Subject:\s*(.*)$/im);
        const subject = subjectMatch 
          ? subjectMatch[1].trim() 
          : `Regarding your post for ${role} - ${profile.fullName}`;
        const body = text.replace(/^Subject:\s*.*$/im, '').trim();

        return resolve({
          subject,
          body,
          generator: 'opencode-cli'
        });
      }

      reject(new Error('OpenCode returned empty output'));
    });
  });
}

/**
 * Standard HTTP LLM fallback (Ollama / OpenCode HTTP server if running)
 */
async function queryLocalLLM(post, profile) {
  const endpoint = process.env.AI_ENDPOINT || 'http://localhost:11434/api/generate';
  const model = process.env.AI_MODEL || 'llama3';
  const role = extractRoleFromPost(post.content);

  const systemPrompt = `Write a short, polite, and sweet cold email (under 50 words) to ${post.author || 'the hiring manager'}.
Do NOT put resume bullet points or project lists in the body.
Directly reference what their post is asking for.
Mention that Ravi Gagiya's updated resume is attached.
Ask for a quick 5-minute call.
Signature: Ravi Gagiya, Full Stack Developer, Phone: +91 7096206404, Email: ravigagiya.cse@gmail.com, LinkedIn: https://linkedin.com/in/ravigagiya

Post Content:
${post.content}

Return JSON only:
{
  "subject": "Regarding your post for ${role} - Ravi Gagiya",
  "body": "..."
}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

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
    if (!res.ok) throw new Error(`LLM status ${res.status}`);

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
 * Tries:
 * 1. OpenCode CLI (`opencode run`)
 * 2. HTTP LLM endpoint (Ollama / Local)
 * 3. Short & Sweet Template (Guaranteed fast fallback)
 */
async function generateColdEmail(post) {
  const profile = getProfile();

  // 1. Try OpenCode CLI first
  try {
    const opencodeResult = await queryOpenCodeCLI(post, profile);
    console.log(`[AI Service] Generated email via ${opencodeResult.generator}`);
    return opencodeResult;
  } catch (opencodeErr) {
    console.log(`[AI Service] OpenCode CLI unavailable: ${opencodeErr.message}`);
  }

  // 2. Try HTTP LLM endpoint (if configured)
  try {
    const llmResult = await queryLocalLLM(post, profile);
    console.log(`[AI Service] Generated email via ${llmResult.generator}`);
    return llmResult;
  } catch (llmErr) {
    // Expected if no local Ollama is active
  }

  // 3. Fallback: Short & Sweet Template (under 50 words, based on post content)
  console.log('[AI Service] Using Short & Sweet resume-matched generator');
  return generateTemplateEmail(post, profile);
}

module.exports = {
  generateColdEmail,
  getProfile
};
