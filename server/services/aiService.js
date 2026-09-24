const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

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
      residentialCity: 'Rajkot, Gujarat',
      currentCTC: '25,000 Month',
      linkedinUrl: 'https://linkedin.com/in/ravigagiya',
      githubUrl: 'https://github.com/RaviAhir77'
    };
  }
}

/**
 * Extract recipient greeting (e.g. "Hi Anzo Technology Team," or "Hi Pooja,")
 */
function extractRecipientGreeting(author, content) {
  if (!author || author === 'LinkedIn Member' || author.toLowerCase().includes('hiring')) {
    const compMatch = (content || '').match(/(?:at|join|with)\s+([A-Z][A-Za-z0-9&.\s]{2,25}?(?:Technologies|Technology|Solutions|Services|LLC|Inc|Labs|Studio|Pvt|Ltd|Team))/i);
    if (compMatch && compMatch[1]) {
      return `Hi ${compMatch[1].trim()} Team,`;
    }
    return 'Hi Hiring Team,';
  }

  const clean = author.replace(/^(dr\.|mr\.|ms\.|mrs\.)\s+/i, '').trim();

  const isCompany = /technology|technologies|solutions|services|llc|inc|labs|studio|consulting|infotech|software|pvt|ltd|team/i.test(clean);
  if (isCompany) {
    return clean.toLowerCase().endsWith('team') ? `Hi ${clean},` : `Hi ${clean} Team,`;
  }

  const parts = clean.split(/\s+/);
  if (parts.length > 1) {
    return `Hi ${parts[0]},`;
  }

  return `Hi ${clean} Team,`;
}

/**
 * Extract target role from LinkedIn post
 */
function extractRoleFromPost(content) {
  if (!content) return 'Full Stack Developer';

  const roleMatch = content.match(/(?:hiring|looking for|seeking|open position for|need a|opening for|opportunity for)\s+(?:an?\s+)?([A-Za-z0-9\s-]{3,35}?(?:developer|engineer|lead|architect|specialist|intern))/i);
  if (roleMatch && roleMatch[1]) return roleMatch[1].trim();

  const text = content.toLowerCase();
  if (text.includes('mern') || (text.includes('react') && text.includes('node'))) return 'MERN Stack Developer';
  if (text.includes('node') || text.includes('backend') || text.includes('express')) return 'Node.js Developer';
  if (text.includes('react native') || text.includes('mobile')) return 'React Native Developer';
  if (text.includes('react') || text.includes('frontend')) return 'React.js Developer';
  if (text.includes('full stack') || text.includes('fullstack')) return 'Full Stack Developer';

  return 'Full Stack Developer';
}

/**
 * Match relevant skills dynamically based on the post
 */
function matchRelevantSkills(content) {
  const text = (content || '').toLowerCase();

  if (text.includes('mern') || (text.includes('react') && text.includes('node') && text.includes('mongo'))) {
    return 'experience working with Node.js, Express.js, React.js, MongoDB, MySQL, REST APIs, and building production web applications, including ERP and real-time platforms.';
  }

  if (text.includes('node') || text.includes('backend')) {
    return '2 years of experience working with Node.js, Express.js, REST APIs, MongoDB, PostgreSQL, and MySQL. I have worked on production applications, ERP systems, third-party integrations, debugging, performance optimization, and backend development.';
  }

  if (text.includes('react native') || text.includes('mobile')) {
    return 'experience working with React Native, TypeScript, Node.js, PostgreSQL, and REST APIs, along with building, testing, and deploying production mobile applications.';
  }

  if (text.includes('full stack') || text.includes('fullstack') || text.includes('typescript')) {
    return 'experience working with Node.js, React.js, JavaScript/TypeScript, PostgreSQL, REST APIs, and Git, along with building and maintaining production ERP and business applications.';
  }

  return '2 years of experience working with Node.js, Express.js, React.js, REST APIs, MongoDB, and PostgreSQL, along with building and maintaining production applications.';
}

/**
 * Intelligent Fallback Template Generator
 * Used when OpenCode is not running or configuring.
 * Note: Salary/CTC is NEVER included unless the post explicitly asks for it!
 */
/**
 * Detect target city (Ahmedabad vs Rajkot)
 */
function detectTargetCity(post, requestedCity) {
  if (requestedCity) {
    const c = String(requestedCity).trim().toUpperCase();
    if (c === 'AHM' || c === 'AHMEDABAD') return 'AHM';
    if (c === 'RJK' || c === 'RAJKOT') return 'RJK';
  }

  // Auto-detect Ahmedabad keywords from post text
  const text = (post.content || '').toLowerCase();
  const hasAhm = /\b(ahmedabad|amdavad|ahd|sg highway|s\.g\. highway|prahladnagar|prahlad nagar|bodakdev|satellite|navrangpura|vastrapur|gandhinagar|gift city|makarba|sanand|iskcon|bopal|chandkheda|thaltej|sola|shela|science city)\b/i.test(text);

  return hasAhm ? 'AHM' : 'RJK';
}

/**
 * Intelligent Fallback Template Generator
 * Used when OpenCode is not running or configuring.
 * Note: Salary/CTC is NEVER included unless the post explicitly asks for it!
 */
function generateTemplateEmail(post, profile, targetCity = 'RJK') {
  const greeting = extractRecipientGreeting(post.author, post.content);
  const role = extractRoleFromPost(post.content);
  const skillsSnippet = matchRelevantSkills(post.content);

  const subject = `Application for ${role} - ${profile.fullName}`;

  // Smart negotiation rule: ONLY show CTC if the post explicitly asked for it!
  const postLower = (post.content || '').toLowerCase();
  const askedForCTC = /\b(current\s*ctc|expected\s*ctc|salary|package|compensation|budget)\b/i.test(postLower);
  const ctcSnippet = askedForCTC ? `Current CTC: ${profile.currentCTC || '25,000 / Month'}` : '';

  // Location handling based on selected resume (Ahmedabad vs Rajkot)
  const cityName = targetCity === 'AHM' ? 'Ahmedabad, Gujarat' : (profile.residentialCity || 'Rajkot, Gujarat');
  const askedForLocation = /\b(location|city|onsite|office|relocat|ahmedabad|rajkot)\b/i.test(postLower);
  const citySnippet = askedForLocation ? `Residential City: ${cityName}` : '';

  const metaLines = [citySnippet, ctcSnippet].filter(Boolean);

  const bodyParts = [
    greeting,
    '',
    `I came across your opening for the ${role} role and would like to apply.`,
    '',
    `I have ${skillsSnippet}`,
    ''
  ];

  if (metaLines.length > 0) {
    bodyParts.push(...metaLines, '');
  }

  bodyParts.push(
    `I’ve attached my resume for your consideration. I’d be happy to discuss the opportunity further.`,
    '',
    `Best regards,`,
    `${profile.fullName}`,
    profile.phone || '+91 7096206404'
  );

  return {
    subject,
    body: bodyParts.join('\n'),
    generator: 'template'
  };
}

/**
 * OpenCode AI Generator
 * Gives OpenCode smart strategic guidance instead of rigid copy-pasting.
 * Lets the AI adapt intelligently to the LinkedIn post while maintaining Ravi's winning style.
 */
async function queryOpenCode(post, profile, targetCity = 'RJK') {
  return new Promise((resolve, reject) => {
    const greeting = extractRecipientGreeting(post.author, post.content);
    const role = extractRoleFromPost(post.content);
    const author = post.author || 'the hiring manager';
    const cityName = targetCity === 'AHM' ? 'Ahmedabad, Gujarat' : 'Rajkot, Gujarat';
    const sanitizedPost = (post.content || '').slice(0, 1000).replace(/\r?\n/g, ' ');

    const prompt = `You are an elite tech cold-email writer drafting an email for software developer Ravi Gagiya.
Ravi is applying to a LinkedIn hiring post.

CANDIDATE PROFILE:
- Name: Ravi Gagiya
- Role: Full Stack Developer (2+ years production experience)
- Skills: Node.js, Express.js, React.js, TypeScript, JavaScript, PostgreSQL, MongoDB, MySQL, REST APIs, Git
- Real Work: Built production ERP platforms, real-time apps, third-party API integrations, and backend optimizations
- Location: ${cityName} (Candidate is local to ${targetCity === 'AHM' ? 'Ahmedabad' : 'Rajkot'})
- Resume: Attached as Ravi_Gagiya_Resume.pdf
- Contact: +91 7096206404

POST CONTEXT:
- Poster: ${author}
- Suggested Greeting: ${greeting}
- Post Text: "${sanitizedPost}"

CRITICAL INSTRUCTIONS:
1. SMART & CONCISE: Write a short, sweet, punchy cold email (under 65 words). Don't sound like a generic template bot. Sound like an energetic, skilled developer speaking directly to the hiring team.
2. RELEVANCE: Read what the post is looking for (tech stack, role, problems). Highlight 1-2 exact matching technical capabilities from Ravi's background that solve what they need.
3. NEGOTIATION RULE (SALARY / CTC): NEVER mention salary or current CTC unless the post explicitly demands it (e.g. "mention CTC"). If not asked, DO NOT mention salary at all. Keep it private for later negotiation.
4. LOCATION: If location matters in the post, mention residing in ${cityName}.
5. CALL TO ACTION: Mention that Ravi's resume is attached for review and invite a quick introductory conversation.
6. SIGNATURE:
Best regards,
Ravi Gagiya
+91 7096206404

OUTPUT FORMAT:
Respond STRICTLY with valid JSON:
{
  "subject": "Application for ${role} - Ravi Gagiya",
  "body": "..."
}`;

    const handleOutput = (text) => {
      // Remove OpenCode CLI status header (e.g. "> build · space-bunny-free")
      const clean = text.replace(/^>.*$/gm, '').trim();
      if (!clean) return reject(new Error('OpenCode returned empty output'));

      // 1. Try direct JSON parsing
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.subject && parsed.body) {
            return resolve({
              subject: parsed.subject.trim(),
              body: parsed.body.trim(),
              generator: 'opencode-ai'
            });
          }
        } catch (_) {}
      }

      // 2. If OpenCode output plain text email with Subject:
      if (clean.length > 25) {
        const subjectMatch = clean.match(/^Subject:\s*(.*)$/im);
        const subject = subjectMatch ? subjectMatch[1].trim() : `Application for ${role} - ${profile.fullName}`;
        const body = clean.replace(/^Subject:\s*.*$/im, '').replace(/^```[a-z]*|```$/g, '').trim();

        return resolve({
          subject,
          body,
          generator: 'opencode-ai'
        });
      }

      reject(new Error('Could not parse OpenCode output'));
    };

    // Execute via execFile (immune to shell quote escaping bugs)
    execFile('opencode', ['run', prompt], { timeout: 25000 }, (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        return handleOutput(stdout);
      }

      // Fast-fail if opencode is not installed in PATH
      if (err && err.code === 'ENOENT') {
        return reject(new Error('OpenCode CLI not found in system PATH'));
      }

      // Fallback via exec (e.g. if opencode is a shell wrapper)
      const escaped = prompt.replace(/"/g, '\\"').replace(/\$/g, '\\$');
      exec(`opencode run "${escaped}"`, { timeout: 20000 }, (cmdErr, cmdStdout) => {
        if (cmdErr) {
          return reject(new Error(`OpenCode execution error: ${cmdErr.message}`));
        }
        handleOutput(cmdStdout || '');
      });
    });
  });
}

/**
 * Main AI Generation Entry Point
 * 1. Determines target city (Ahmedabad vs Rajkot) & correct resume file
 * 2. Attempts OpenCode AI first (using smart prompt guidance)
 * 3. Falls back to smart template if OpenCode is offline/not logged in
 */
async function generateColdEmail(post, requestedCity) {
  const profile = getProfile();
  const targetCity = detectTargetCity(post, requestedCity);
  const resumeFile = targetCity === 'AHM' ? 'assets/Ravi_Gagiya_2026A.pdf' : 'assets/Ravi_Gagiya_Resume.pdf';

  console.log(`[AI Service] Selected target city: ${targetCity} (Resume: ${resumeFile})`);

  // 1. Try OpenCode AI
  try {
    console.log('[AI Service] Asking OpenCode AI to craft smart personalized email...');
    const aiResult = await queryOpenCode(post, profile, targetCity);
    console.log(`[AI Service] Successfully generated smart email via OpenCode AI!`);
    return {
      ...aiResult,
      selectedCity: targetCity,
      resumeFile
    };
  } catch (err) {
    console.log(`[AI Service] OpenCode AI unavailable (${err.message}) -> using Smart Template`);
  }

  // 2. Smart Fallback Template (NO salary unless requested in post)
  const templateResult = generateTemplateEmail(post, profile, targetCity);
  return {
    ...templateResult,
    selectedCity: targetCity,
    resumeFile
  };
}

module.exports = {
  generateColdEmail,
  getProfile
};
