// Question wording transcribed from the supplied Fall 2026 Robotics form.
// Google Forms grids produce one Sheet column for each choice row.
const ROBOTICS_QUESTIONS = [
  'How many hours can you commit to ACM Robotics projects?',
  'Why do you want to participate in ACM Robotics Projects?',
  'Which sub-team role are you most interested in? [First Choice]',
  'Which sub-team role are you most interested in? [Second Choice]',
  'Why are you interested in your first choice?',
  'How familiar are you with the tools related to your first choice role?',
  'How proficient are you with Git/Github?',
  'How proficient are you with C++?',
  'How proficient are you with Python?',
  "Tell us about a past technical or creative project you’ve worked on (doesn't have to be robotics-related). What was the project, and what was your specific contribution?",
  'Any Comments, Questions, Concerns?',
];

export function createMockSheetRows(): string[][] {
  const headers = Array.from({ length: 60 }, (_, index) => `Question ${index + 1}`);
  headers[2] = 'Applicant Name';
  headers[13] = 'First Priority';
  headers[14] = 'Second Priority';
  headers[15] = 'Third Priority';
  headers[16] = 'Fourth Priority';
  headers[headers.length - 1] = 'Reviewer Comments';

  const row = Array.from({ length: 60 }, (_, index) => `Sample response ${index + 1}`);
  row[2] = 'Test Applicant';
  row[13] = 'AI';
  row[14] = 'Design';
  row[15] = 'Hack';
  row[16] = 'Robotics';
  row[row.length - 1] = '';

  const secondRow = Array.from(
    { length: 60 },
    (_, index) => `Second fake application response ${index + 1}`,
  );
  secondRow[2] = 'Second Test Applicant';
  secondRow[13] = 'Design';
  secondRow[14] = 'Hack';
  secondRow[15] = 'AI';
  secondRow[16] = 'Robotics';
  secondRow[secondRow.length - 1] = '';

  // Explicit section prefixes keep the expanded Robotics section independent
  // of the legacy six-column layout.
  for (let index = 0; index < 57; index += 1) {
    const section = index < 17 ? 'General'
      : index < 25 ? 'AI'
      : index < 34 ? 'Design'
      : index < 47 ? 'Hack'
      : index < 53 ? 'Robotics'
      : 'Other';
    headers[index] = `[${section}] ${headers[index]}`;
  }

  headers.splice(47, 6, ...ROBOTICS_QUESTIONS.map(
    (question) => `[Robotics] ${question}`,
  ));
  row.splice(47, 6,
    '6–8 hours per week (demo response).',
    'I want to build an autonomous robot and learn how software and hardware work together (demo response).',
    'Software Engineer',
    'Embedded Engineer',
    'I enjoy Python and want to apply computer vision to a physical robot (demo response).',
    'I have used Python and am beginning to learn YOLO and MQTT (demo response).',
    '3', '2', '4',
    'I built a small object-detection demo; I prepared the dataset and wrote the Python inference script (demo response).',
    'Will there be introductory hardware workshops? (demo response).',
  );
  secondRow.splice(47, 6,
    '5 hours per week (demo response).',
    'I want experience designing and testing moving hardware (demo response).',
    'Mechanical Engineer',
    'Embedded Engineer',
    'I like turning CAD designs into working mechanisms (demo response).',
    'I have made basic CAD models and am new to Autodesk Inventor (demo response).',
    '2', '3', '2',
    'I designed and 3D-printed a small gripper; I modeled the parts and tested their fit (demo response).',
    'No additional questions (demo response).',
  );
  // Include a Robotics-first applicant so the priority filter can be exercised.
  secondRow[13] = 'Robotics';
  secondRow[14] = 'Design';
  secondRow[15] = 'Hack';
  secondRow[16] = 'AI';

  return [headers, row, secondRow];
}

