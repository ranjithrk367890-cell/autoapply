const TECH_SKILLS_TAXONOMY = [
  'javascript', 'typescript', 'react', 'react.js', 'node.js', 'node', 'express.js', 'express',
  'mongodb', 'mern', 'html5', 'html', 'css3', 'css', 'redux', 'tailwind', 'bootstrap',
  'rest api', 'graphql', 'next.js', 'python', 'java', 'c++', 'c#', 'sql', 'postgresql',
  'mysql', 'git', 'github', 'docker', 'kubernetes', 'aws', 'azure', 'linux', 'jest',
  'cypress', 'ci/cd', 'agile', 'microservices', 'jwt', 'webpack', 'vite'
];

function analyzeAtsScore(candidateProfile, jobDescription = '', targetRole = '', requiredSkills = []) {
  const resumeText = (candidateProfile?.rawText || '').toLowerCase();
  const candidateSkills = ((candidateProfile?.skills && candidateProfile.skills.length > 0) 
    ? candidateProfile.skills 
    : ['JavaScript', 'React.js', 'Node.js', 'Express.js', 'MongoDB', 'HTML5', 'CSS3', 'Git', 'GitHub', 'REST APIs', 'Python']
  ).map(s => String(s).toLowerCase());
  const jobText = (jobDescription || '').toLowerCase();

  // Combine requiredSkills and detected skills from job description
  const allKeywordsSet = new Set();
  
  if (Array.isArray(requiredSkills)) {
    requiredSkills.forEach(s => {
      if (s) allKeywordsSet.add(String(s).toLowerCase());
    });
  }

  TECH_SKILLS_TAXONOMY.forEach(skill => {
    if (jobText.includes(skill)) {
      allKeywordsSet.add(skill);
    }
  });

  // If no specific job text provided, use default target skills for MERN / Developer
  if (allKeywordsSet.size === 0) {
    ['javascript', 'react.js', 'node.js', 'express.js', 'mongodb', 'html5', 'css3', 'git', 'rest api', 'redux'].forEach(s => allKeywordsSet.add(s));
  }

  const jobKeywords = Array.from(allKeywordsSet);
  const matchedKeywords = [];
  const missingKeywords = [];

  jobKeywords.forEach(kw => {
    const isFound = candidateSkills.some(s => s.includes(kw) || kw.includes(s)) ||
                    resumeText.includes(kw);
    if (isFound) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  });

  // Calculate ATS Match Score
  let score = 50;
  if (jobKeywords.length > 0) {
    const ratio = matchedKeywords.length / jobKeywords.length;
    score = Math.round(35 + (ratio * 55));
  } else {
    score = candidateSkills.length >= 5 ? 85 : 70;
  }

  // Bonus for experience & structure
  if (candidateProfile?.experienceYears > 0) score += 5;
  if (candidateProfile?.email && candidateProfile?.phone) score += 5;

  score = Math.min(Math.max(score, 45), 98);

  // Recommendations to hit 80%+ ATS Score
  const boostSuggestions = [];
  if (missingKeywords.length > 0) {
    boostSuggestions.push(`Add missing technical keywords: ${missingKeywords.slice(0, 5).map(s => s.toUpperCase()).join(', ')}`);
  }
  if (!resumeText.includes('built') && !resumeText.includes('developed') && !resumeText.includes('implemented')) {
    boostSuggestions.push('Use strong action verbs like "Built", "Developed", "Optimized", and "Architected" at start of experience points.');
  }
  if (!resumeText.includes('%') && !resumeText.includes('improved') && !resumeText.includes('reduced')) {
    boostSuggestions.push('Quantify project results with metrics (e.g. "Improved API response speed by 35%").');
  }

  const mainRole = targetRole || (candidateProfile?.targetRoles && candidateProfile.targetRoles[0]) || 'Software Developer';
  const topMatched = matchedKeywords.slice(0, 3).map(s => s.toUpperCase()).join(', ') || 'REACT.JS, NODE.JS';
  const topMissing = missingKeywords.slice(0, 3).map(s => s.toUpperCase()).join(', ') || 'TYPESCRIPT, REDUX';

  const optimizedBulletPoints = [
    `Developed and maintained high-performance web applications as a ${mainRole} using ${topMatched}, ensuring 99.9% uptime and smooth user experience.`,
    missingKeywords.length > 0
      ? `Integrated ${topMissing} into full-stack architecture to streamline API endpoints, reducing page load times by 30%.`
      : `Optimized database queries and RESTful API endpoints for maximum scalability across cloud environments.`,
    `Collaborated with agile development teams to implement responsive user interfaces and clean, maintainable code standards.`
  ];

  return {
    atsScore: score,
    targetScore: 80,
    isAboveTarget: score >= 80,
    matchedKeywords,
    missingKeywords,
    totalKeywordsCount: jobKeywords.length,
    boostSuggestions,
    optimizedBulletPoints
  };
}

module.exports = {
  analyzeAtsScore,
  TECH_SKILLS_TAXONOMY
};
