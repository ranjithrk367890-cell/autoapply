const fs = require('fs');
const pdfParse = require('pdf-parse');

const TECH_SKILLS_TAXONOMY = [
  'JavaScript', 'TypeScript', 'React.js', 'React', 'Node.js', 'Express.js', 'Express',
  'MongoDB', 'MERN', 'HTML5', 'HTML', 'CSS3', 'CSS', 'Redux', 'Tailwind', 'Bootstrap',
  'REST API', 'GraphQL', 'Next.js', 'Python', 'Java', 'C++', 'C#', 'SQL', 'PostgreSQL',
  'MySQL', 'Git', 'GitHub', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'Linux'
];

async function parseResumeFile(filePath, fileMimeType) {
  let text = '';
  
  if (fileMimeType === 'application/pdf' || filePath.endsWith('.pdf')) {
    const dataBuffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(dataBuffer);
    text = parsed.text || '';
  } else {
    // TXT or fallback string read
    text = fs.readFileSync(filePath, 'utf8') || '';
  }

  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const email = emailMatch ? emailMatch[0].trim() : null;

  // Phone regex supporting international & Indian mobile format
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s\-]?)?(?:\(?\d{3}\)?[\s\-]?)?\d{3}[\s\-]?\d{4}/) ||
                     text.match(/(?:\+91[\s\-]?)?[6-9]\d{9}/);
  const phone = phoneMatch ? phoneMatch[0].trim() : null;

  // Extract skills matching taxonomy
  const foundSkills = new Set();
  const lowerText = text.toLowerCase();
  
  for (const skill of TECH_SKILLS_TAXONOMY) {
    const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      foundSkills.add(skill);
    }
  }

  // Extract experience years
  let experienceYears = 0;
  const expMatch = lowerText.match(/(\d+(?:\.\d+)?)\s*(?:\+|\-|to)?\s*(?:years?|yrs?)/i);
  if (expMatch && expMatch[1]) {
    experienceYears = parseFloat(expMatch[1]);
  } else if (lowerText.includes('fresher') || lowerText.includes('entry level')) {
    experienceYears = 0;
  }

  return {
    rawText: text,
    email,
    phone,
    skills: Array.from(foundSkills),
    experienceYears
  };
}

module.exports = {
  parseResumeFile,
  TECH_SKILLS_TAXONOMY
};
