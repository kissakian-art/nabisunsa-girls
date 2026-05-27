import { Subject, Combination, Course, SchoolConfig, User } from '../types';
import { Timestamp } from 'firebase/firestore';

export const DEFAULT_SUBJECTS: Subject[] = [
  // O-Level Core Subjects
  { id: 'o_english', name: 'English Language', code: '112', level: 'O-Level', category: 'Language', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_mathematics', name: 'Mathematics', code: '456', level: 'O-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_physics', name: 'Physics', code: '535', level: 'O-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_chemistry', name: 'Chemistry', code: '545', level: 'O-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_biology', name: 'Biology', code: '553', level: 'O-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_geography', name: 'Geography', code: '273', level: 'O-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_history', name: 'History', code: '241', level: 'O-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_kiswahili', name: 'Kiswahili', code: '118', level: 'O-Level', category: 'Language', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_french', name: 'French', code: '122', level: 'O-Level', category: 'Language', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_ict', name: 'ICT (Computer Studies)', code: '840', level: 'O-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_entrepreneurship', name: 'Entrepreneurship Education', code: '280', level: 'O-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_agriculture', name: 'Agriculture', code: '527', level: 'O-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_foods_nutrition', name: 'Foods and Nutrition', code: '662', level: 'O-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_fine_art', name: 'Fine Art', code: '610', level: 'O-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_ire', name: 'Islamic Religious Education (IRE)', code: '225', level: 'O-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_cre', name: 'Christian Religious Education (CRE)', code: '223', level: 'O-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'o_pe', name: 'Physical Education', code: '900', level: 'O-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },

  // A-Level Principal Subjects
  { id: 'a_mathematics', name: 'Mathematics (Principal)', code: 'P425', level: 'A-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_physics', name: 'Physics (Principal)', code: 'P510', level: 'A-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_chemistry', name: 'Chemistry (Principal)', code: 'P525', level: 'A-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_biology', name: 'Biology (Principal)', code: 'P530', level: 'A-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_economics', name: 'Economics (Principal)', code: 'P220', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_geography', name: 'Geography (Principal)', code: 'P250', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_history', name: 'History (Principal)', code: 'P210', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_literature', name: 'Literature in English (Principal)', code: 'P310', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_entrepreneurship', name: 'Entrepreneurship (Principal)', code: 'P230', level: 'A-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_sub_ict', name: 'Subsidiary ICT', code: 'S850', level: 'A-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_sub_math', name: 'Subsidiary Mathematics', code: 'S475', level: 'A-Level', category: 'Science', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_general_paper', name: 'General Paper', code: 'S101', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_div', name: 'Divinity (Principal)', code: 'P245', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_islam', name: 'Islamic Religious Education (Principal)', code: 'P235', level: 'A-Level', category: 'Arts', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_fine_art', name: 'Fine Art (Principal)', code: 'P615', level: 'A-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' },
  { id: 'a_agriculture', name: 'Agriculture (Principal)', code: 'P515', level: 'A-Level', category: 'Technical', isDefault: true, schoolId: 'nabisunsa_girls' }
];

export const DEFAULT_COMBINATIONS: Combination[] = [
  {
    id: 'PCM',
    name: 'Physics, Chemistry, Mathematics',
    subjects: ['a_physics', 'a_chemistry', 'a_mathematics'],
    uceRequirements: [
      { subjectId: 'o_mathematics', maxGrade: 4 },
      { subjectId: 'o_physics', maxGrade: 5 },
      { subjectId: 'o_chemistry', maxGrade: 5 }
    ]
  },
  {
    id: 'PCB',
    name: 'Physics, Chemistry, Biology',
    subjects: ['a_physics', 'a_chemistry', 'a_biology'],
    uceRequirements: [
      { subjectId: 'o_biology', maxGrade: 4 },
      { subjectId: 'o_chemistry', maxGrade: 4 },
      { subjectId: 'o_physics', maxGrade: 5 }
    ]
  },
  {
    id: 'BCM',
    name: 'Biology, Chemistry, Mathematics',
    subjects: ['a_biology', 'a_chemistry', 'a_mathematics'],
    uceRequirements: [
      { subjectId: 'o_mathematics', maxGrade: 4 },
      { subjectId: 'o_biology', maxGrade: 4 },
      { subjectId: 'o_chemistry', maxGrade: 4 }
    ]
  },
  {
    id: 'PEM',
    name: 'Physics, Economics, Mathematics',
    subjects: ['a_physics', 'a_economics', 'a_mathematics'],
    uceRequirements: [
      { subjectId: 'o_mathematics', maxGrade: 3 },
      { subjectId: 'o_physics', maxGrade: 5 }
    ]
  },
  {
    id: 'BCA',
    name: 'Biology, Chemistry, Agriculture',
    subjects: ['a_biology', 'a_chemistry', 'a_agriculture'],
    uceRequirements: [
      { subjectId: 'o_biology', maxGrade: 4 },
      { subjectId: 'o_chemistry', maxGrade: 5 },
      { subjectId: 'o_agriculture', maxGrade: 5 }
    ]
  },
  {
    id: 'PCA',
    name: 'Physics, Chemistry, Agriculture',
    subjects: ['a_physics', 'a_chemistry', 'a_agriculture'],
    uceRequirements: [
      { subjectId: 'o_physics', maxGrade: 5 },
      { subjectId: 'o_chemistry', maxGrade: 5 },
      { subjectId: 'o_agriculture', maxGrade: 5 }
    ]
  },
  {
    id: 'BAG',
    name: 'Biology, Agriculture, Geography',
    subjects: ['a_biology', 'a_agriculture', 'a_geography'],
    uceRequirements: [
      { subjectId: 'o_biology', maxGrade: 4 },
      { subjectId: 'o_agriculture', maxGrade: 5 },
      { subjectId: 'o_geography', maxGrade: 5 }
    ]
  },
  {
    id: 'MEG',
    name: 'Mathematics, Economics, Geography',
    subjects: ['a_mathematics', 'a_economics', 'a_geography'],
    uceRequirements: [
      { subjectId: 'o_mathematics', maxGrade: 4 },
      { subjectId: 'o_geography', maxGrade: 5 }
    ]
  },
  {
    id: 'HEG',
    name: 'History, Economics, Geography',
    subjects: ['a_history', 'a_economics', 'a_geography'],
    uceRequirements: [
      { subjectId: 'o_history', maxGrade: 5 },
      { subjectId: 'o_geography', maxGrade: 5 }
    ]
  },
  {
    id: 'HEL',
    name: 'History, Economics, Literature in English',
    subjects: ['a_history', 'a_economics', 'a_literature'],
    uceRequirements: [
      { subjectId: 'o_history', maxGrade: 5 },
      { subjectId: 'o_english', maxGrade: 4 }
    ]
  },
  {
    id: 'HLD',
    name: 'History, Literature, Divinity',
    subjects: ['a_history', 'a_literature', 'a_div'],
    uceRequirements: [
      { subjectId: 'o_history', maxGrade: 5 },
      { subjectId: 'o_english', maxGrade: 4 }
    ]
  },
  {
    id: 'DEG',
    name: 'Divinity, Economics, Geography',
    subjects: ['a_div', 'a_economics', 'a_geography'],
    uceRequirements: [
      { subjectId: 'o_cre', maxGrade: 5 },
      { subjectId: 'o_geography', maxGrade: 5 }
    ]
  },
  {
    id: 'HEntG',
    name: 'History, Entrepreneurship, Geography',
    subjects: ['a_history', 'a_entrepreneurship', 'a_geography'],
    uceRequirements: [
      { subjectId: 'o_history', maxGrade: 5 },
      { subjectId: 'o_geography', maxGrade: 5 }
    ]
  },
  {
    id: 'HGL',
    name: 'History, Geography, Literature',
    subjects: ['a_history', 'a_geography', 'a_literature'],
    uceRequirements: [
      { subjectId: 'o_history', maxGrade: 5 },
      { subjectId: 'o_geography', maxGrade: 5 }
    ]
  },
  {
    id: 'MEntE',
    name: 'Mathematics, Entrepreneurship, Economics',
    subjects: ['a_mathematics', 'a_entrepreneurship', 'a_economics'],
    uceRequirements: [
      { subjectId: 'o_mathematics', maxGrade: 4 }
    ]
  },
  {
    id: 'PAM',
    name: 'Physics, Fine Art, Mathematics',
    subjects: ['a_physics', 'a_fine_art', 'a_mathematics'],
    uceRequirements: [
      { subjectId: 'o_physics', maxGrade: 5 },
      { subjectId: 'o_mathematics', maxGrade: 4 }
    ]
  },
  {
    id: 'GEA',
    name: 'Geography, Economics, Agriculture',
    subjects: ['a_geography', 'a_economics', 'a_agriculture'],
    uceRequirements: [
      { subjectId: 'o_geography', maxGrade: 5 },
      { subjectId: 'o_agriculture', maxGrade: 5 }
    ]
  },
  {
    id: 'MEFA',
    name: 'Mathematics, Economics, Fine Art',
    subjects: ['a_mathematics', 'a_economics', 'a_fine_art'],
    uceRequirements: [
      { subjectId: 'o_mathematics', maxGrade: 4 }
    ]
  }
];

export const DEFAULT_COURSES: Course[] = [
  // 1. Medicine & Health Sciences
  {
    id: 'muk_mbchb',
    code: 'MBCHB',
    name: 'Bachelor of Medicine and Bachelor of Surgery',
    institution: 'Makerere University (MUK)',
    institutionType: 'University',
    duration: '5 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_chemistry'],
      relevant: ['a_physics', 'a_mathematics'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    uceRequirements: [
      { subjectId: 'o_biology', maxGrade: 4 },
      { subjectId: 'o_chemistry', maxGrade: 4 },
      { subjectId: 'o_mathematics', maxGrade: 4 }
    ],
    governmentCutOff: 48.5,
    privateCutOff: 38.0,
    isVocational: false,
    careerDetails: {
      description: 'The premium medical course in East Africa, producing highly competent clinical doctors, surgeons, and healthcare researchers.',
      jobs: ['Medical Doctor', 'Surgeon', 'Clinical Researcher', 'Hospital Administrator', 'Public Health Consultant'],
      averageStartingSalary: 'UGX 2,500,000 - 4,500,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Critical shortages of specialists across Uganda and the wider East African Community ensure immediate and highly compensated placement.'
    }
  },
  {
    id: 'muk_pharmacy',
    code: 'PHA',
    name: 'Bachelor of Pharmacy',
    institution: 'Makerere University (MUK)',
    institutionType: 'University',
    duration: '4 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_chemistry'],
      relevant: ['a_physics', 'a_mathematics'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    governmentCutOff: 48.1,
    privateCutOff: 37.0,
    isVocational: false,
    careerDetails: {
      description: 'Focuses on the science of medicines, clinical therapeutics, pharmacology, and pharmaceutical product manufacture.',
      jobs: ['Pharmacist', 'Production Manager', 'Clinical Pharmacologist', 'Drug Inspector (NDA)', 'Medical Representative'],
      averageStartingSalary: 'UGX 2,000,000 - 3,500,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Rapid growth of localized drug manufacture in Uganda (e.g. Cipla Quality Chemical Industries) creates premium domestic job openings.'
    }
  },

  // 2. Engineering & Architecture
  {
    id: 'muk_civil',
    code: 'CIV',
    name: 'Bachelor of Science in Civil Engineering',
    institution: 'Makerere University (MUK)',
    institutionType: 'University',
    duration: '4 Years',
    uaceRequirements: {
      essential: ['a_mathematics', 'a_physics'],
      relevant: ['a_chemistry', 'a_geography'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    governmentCutOff: 47.2,
    privateCutOff: 35.8,
    isVocational: false,
    careerDetails: {
      description: 'A formal engineering course covering the design, construction, and management of infrastructure like roads, bridges, dams, and structural buildings.',
      jobs: ['Civil Engineer', 'Structural Designer', 'Project Manager', 'Hydrology Engineer', 'Site Consultant'],
      averageStartingSalary: 'UGX 2,000,000 - 4,000,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Massive public infrastructure developments (Standard Gauge Railway, oil pipe laying, highway expansions) fuel long-term engineering demand.'
    }
  },
  {
    id: 'kyu_electrical',
    code: 'ELD',
    name: 'Bachelor of Engineering in Electrical Engineering',
    institution: 'Kyambogo University (KYU)',
    institutionType: 'University',
    duration: '4 Years',
    uaceRequirements: {
      essential: ['a_mathematics', 'a_physics'],
      relevant: ['a_chemistry', 'a_economics'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    governmentCutOff: 45.8,
    privateCutOff: 33.5,
    isVocational: false,
    careerDetails: {
      description: 'Advanced course focusing on power systems, renewable energies, electrical grid design, control systems, and automation.',
      jobs: ['Electrical Engineer', 'Power Grid Supervisor', 'Renewable Energy Analyst', 'Control Systems Engineer', 'Grid Consultant'],
      averageStartingSalary: 'UGX 1,800,000 - 3,200,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'National focus on rural electrification, solar grid buildouts, and factories under the UEPB requires hundreds of qualified engineers.'
    }
  },

  // 3. Computing & Technology
  {
    id: 'muk_cs',
    code: 'CSC',
    name: 'Bachelor of Science in Computer Science',
    institution: 'Makerere University (MUK)',
    institutionType: 'University',
    duration: '3 Years',
    uaceRequirements: {
      essential: ['a_mathematics', 'a_physics'],
      relevant: ['a_chemistry', 'a_economics', 'a_geography'],
      desirable: ['a_general_paper', 'a_sub_ict']
    },
    governmentCutOff: 44.5,
    privateCutOff: 32.5,
    isVocational: false,
    careerDetails: {
      description: 'Studies algorithmic computation, software development paradigms, database design, AI, cybersecurity, and networking.',
      jobs: ['Software Developer', 'Data Scientist', 'Database Administrator', 'Network Architect', 'AI Engineer'],
      averageStartingSalary: 'UGX 1,500,000 - 3,500,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Global software outsourcing and local digitalization (Fintech, Telecoms like MTN & Airtel, e-government systems) place CS graduates at a massive premium.'
    }
  },

  // 4. Law & Social Sciences
  {
    id: 'muk_law',
    code: 'LAW',
    name: 'Bachelor of Laws (LLB)',
    institution: 'Makerere University (MUK)',
    institutionType: 'University',
    duration: '4 Years',
    uaceRequirements: {
      essential: ['a_history', 'a_literature'], // Typical representation for essential
      relevant: ['a_economics', 'a_geography', 'a_div', 'a_islam'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    uceRequirements: [
      { subjectId: 'o_english', maxGrade: 3 } // Requires Credit 3 or better in English
    ],
    governmentCutOff: 46.8,
    privateCutOff: 36.5,
    isVocational: false,
    careerDetails: {
      description: 'Elite legal curriculum. Students must pass the Makerere Law Pre-Entry Exam in addition to standard cutoff requirements.',
      jobs: ['Advocate', 'Legal Consultant', 'Corporate Secretary', 'Magistrate', 'Human Rights Advisor'],
      averageStartingSalary: 'UGX 1,500,000 - 3,500,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Expanding financial structures, mineral contracts, oil and gas laws, and corporate regulation in Uganda require highly trained legal minds.'
    }
  },

  // 5. Business & Economics
  {
    id: 'mubs_bib',
    code: 'BIB',
    name: 'Bachelor of International Business',
    institution: 'Makerere University Business School (MUBS)',
    institutionType: 'University',
    duration: '3 Years',
    uaceRequirements: {
      essential: ['a_economics', 'a_geography'],
      relevant: ['a_mathematics', 'a_history', 'a_entrepreneurship'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    governmentCutOff: 43.1,
    privateCutOff: 29.5,
    isVocational: false,
    careerDetails: {
      description: 'Focuses on global markets, import-export trade regulations, international finance, logistics, and multi-national corporation management.',
      jobs: ['Logistics Coordinator', 'Foreign Trade Consultant', 'Brand Specialist', 'Treasury Executive', 'Import-Export Supervisor'],
      averageStartingSalary: 'UGX 1,200,000 - 2,500,000 / month',
      growthProspects: 'Medium',
      prospectsReasoning: 'Regional integration within the East African Community (EAC) creates excellent trade jobs, though competition remains high.'
    }
  },

  // 6. Elite Vocational & Skills-focused Tracks
  {
    id: 'nvti_mech',
    code: 'NV-MECH',
    name: 'National Diploma in Automobile Engineering & Mechanics',
    institution: 'Nakawa Vocational Training Institute',
    institutionType: 'Institute',
    duration: '2 Years',
    uaceRequirements: {
      essential: ['a_physics', 'a_mathematics'],
      relevant: ['a_chemistry', 'a_sub_ict'],
      desirable: ['a_general_paper']
    },
    governmentCutOff: 20.0, // Low cutoff because vocational focuses on basic passes
    privateCutOff: 10.0,
    isVocational: true,
    careerDetails: {
      description: 'A hands-on, practical program in vehicle diagnostics, engine rebuilding, automotive electronics, and heavy machinery servicing.',
      jobs: ['Automotive Technologist', 'Fleet Manager', 'Garage Owner', 'Heavy Equipment Specialist', 'Insurance Claims Evaluator'],
      averageStartingSalary: 'UGX 1,000,000 - 2,200,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Highly practical! Skilled automotive diagnostic experts who can handle modern vehicle electronics are scarce and in massive demand in Kampala.'
    }
  },
  {
    id: 'uhtti_catering',
    code: 'HT-CAT',
    name: 'Diploma in Pastry, Baking & Hotel Catering',
    institution: 'Uganda Hotel and Tourism Training Institute (Jinja)',
    institutionType: 'Institute',
    duration: '2 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_geography'],
      relevant: ['a_entrepreneurship', 'a_chemistry'],
      desirable: ['a_general_paper']
    },
    isVocational: true,
    careerDetails: {
      description: 'Top-tier hospitality training, developing skilled pastry chefs, food scientists, and kitchen managers for elite hotels and catering businesses.',
      jobs: ['Executive Chef', 'Pastry Artisan', 'Catering Entrepreneur', 'Food Quality Inspector', 'Restaurant Manager'],
      averageStartingSalary: 'UGX 800,000 - 2,500,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Uganda\'s booming tourism industry and high-end restaurant scene in Kampala and Entebbe create a rapid and profitable career path.'
    }
  },
  {
    id: 'mulago_nurse',
    code: 'NS-MID',
    name: 'Diploma in General Nursing & Midwifery',
    institution: 'Mulago School of Nursing & Midwifery',
    institutionType: 'College',
    duration: '3 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_chemistry'],
      relevant: ['a_physics', 'a_mathematics'],
      desirable: ['a_general_paper']
    },
    isVocational: true,
    careerDetails: {
      description: 'Hands-on nursing clinicals, delivering expert midwifery and maternity practices inside Uganda\'s national referral hospital environment.',
      jobs: ['Registered Nurse', 'Certified Midwife', 'Maternity Supervisor', 'Community Health Worker', 'Clinical Educator'],
      averageStartingSalary: 'UGX 1,000,000 - 1,800,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Nurses and midwives represent the backbone of health systems; vacancies are widespread in public and high-end private clinics (e.g. Nakasero Hospital).'
    }
  },
  {
    id: 'watoto_fashion',
    code: 'FASH-DES',
    name: 'Professional Vacation Certificate in Fashion, Crested Design & Tailoring',
    institution: 'Watoto Skills Care & Vocational Center',
    institutionType: 'Institute',
    duration: '6 Months',
    uaceRequirements: {
      essential: ['a_fine_art'],
      relevant: ['a_entrepreneurship'],
      desirable: ['a_general_paper']
    },
    isVocational: true,
    careerDetails: {
      description: 'An elite holiday vacation program teaching haute couture tailoring, school uniform manufacture, fashion merchandising, and brand building.',
      jobs: ['Fashion Designer', 'Custom Tailoring Proprietor', 'Uniform Supplier', 'Apparel Consultant', 'Creative Director'],
      averageStartingSalary: 'UGX 800,000 - 3,000,000 / month (Revenue dependent)',
      growthProspects: 'High',
      prospectsReasoning: 'Immediate income potential. Highly valued by parents who want their daughters to acquire practical, wealth-generating craft skills during holidays.'
    }
  },
  {
    id: 'must_medicine',
    code: 'MBCHB',
    name: 'Bachelor of Medicine and Bachelor of Surgery',
    institution: 'Mbarara University of Science and Technology (MUST)',
    institutionType: 'University',
    duration: '5 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_chemistry'],
      relevant: ['a_physics', 'a_mathematics'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    isVocational: false,
    careerDetails: {
      description: 'Highly competitive clinical medicine program in western Uganda, prioritizing practical referral hospital training.',
      jobs: ['Medical Doctor', 'Surgeon', 'Clinical Director', 'Healthcare Consultant'],
      averageStartingSalary: 'UGX 2,000,000 - 4,000,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'MUST is globally renowned for superb practical medicine training, guaranteeing exceptionally high employer regard.'
    }
  },
  {
    id: 'kiu_pharmacy',
    code: 'PHA',
    name: 'Bachelor of Pharmacy',
    institution: 'Kampala International University (KIU)',
    institutionType: 'University',
    duration: '4 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_chemistry'],
      relevant: ['a_physics', 'a_mathematics'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    isVocational: false,
    careerDetails: {
      description: 'Hands-on pharmacy and pharmaceutical formulation training in KIU\'s premier industrial science laboratories.',
      jobs: ['Clinical Pharmacist', 'Retail Pharmacy Proprietor', 'Pharmaceutical Sales Manager', 'Quality Controller'],
      averageStartingSalary: 'UGX 1,500,000 - 3,000,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'KIU possesses the largest teaching hospital in Uganda, offering outstanding direct entry clinical practice.'
    }
  },
  {
    id: 'ucu_law',
    code: 'LAW',
    name: 'Bachelor of Laws (LLB)',
    institution: 'Uganda Christian University (UCU)',
    institutionType: 'University',
    duration: '4 Years',
    uaceRequirements: {
      essential: ['a_history', 'a_literature'],
      relevant: ['a_economics', 'a_div', 'a_islam'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    uceRequirements: [
      { subjectId: 'o_english', maxGrade: 3 }
    ],
    isVocational: false,
    careerDetails: {
      description: 'Highly prestigious Christian-centered legal curriculum preparing ethical advocates for the corporate bar.',
      jobs: ['Corporate Advocate', 'Judicial Clerk', 'Legal Compliance Officer', 'Arbitrator'],
      averageStartingSalary: 'UGX 1,500,000 - 3,500,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'UCU law graduates consistently achieve the highest bar course pass rates at the Law Development Center (LDC).'
    }
  },
  {
    id: 'busitema_agric',
    code: 'BSA',
    name: 'Bachelor of Science in Agriculture',
    institution: 'Busitema University',
    institutionType: 'University',
    duration: '3 Years',
    uaceRequirements: {
      essential: ['a_biology', 'a_chemistry'],
      relevant: ['a_geography', 'a_economics', 'a_agriculture'],
      desirable: ['a_general_paper', 'a_sub_math']
    },
    isVocational: false,
    careerDetails: {
      description: 'Modern agricultural systems, crop husbandry, soil sciences, and mechanization technologies at Busitema.',
      jobs: ['Agribusiness Manager', 'Agricultural Extension Officer', 'Farm Mechanization Consultant'],
      averageStartingSalary: 'UGX 1,000,000 - 2,000,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Busitema is the leading national university for agricultural mechanization and sustainable farming technologies.'
    }
  },
  {
    id: 'gulu_cs',
    code: 'CSC',
    name: 'Bachelor of Science in Computer Science',
    institution: 'Gulu University',
    institutionType: 'University',
    duration: '3 Years',
    uaceRequirements: {
      essential: ['a_mathematics', 'a_physics'],
      relevant: ['a_chemistry', 'a_economics'],
      desirable: ['a_general_paper', 'a_sub_ict']
    },
    isVocational: false,
    careerDetails: {
      description: 'Focuses on core computing models, database systems, web applications, and local software developments.',
      jobs: ['Web Developer', 'IT Support Specialist', 'Database Assistant', 'Network Administrator'],
      averageStartingSalary: 'UGX 1,000,000 - 2,000,000 / month',
      growthProspects: 'High',
      prospectsReasoning: 'Accelerating tech growth and agribusiness hubs in northern Uganda offer excellent local placements for Gulu IT graduates.'
    }
  }
];

export const MOCK_SCHOOL_CONFIG: SchoolConfig = {
  id: 'nabisunsa_girls',
  name: "Nabisunsa Girls' Secondary School",
  motto: 'Empowerment Through Education',
  logoUrl: 'https://nabisunsagirls.ac.ug/logo.png', // Crest placeholder
  isActive: true,
  currentTermId: '2026_term1',
  gradingSystem: {
    weights: {
      continuousAssessment: 20,
      endOfTerm: 80
    },
    scale: [
      { grade: 'A', minScore: 80, label: 'Distinction 1 (D1)' },
      { grade: 'B', minScore: 70, label: 'Credit 3 (C3)' },
      { grade: 'C', minScore: 60, label: 'Credit 5 (C5)' },
      { grade: 'D', minScore: 50, label: 'Pass 7 (P7)' },
      { grade: 'E', minScore: 40, label: 'Pass 8 (P8)' },
      { grade: 'O', minScore: 30, label: 'Subsidiary (O)' },
      { grade: 'F', minScore: 0, label: 'Failure (F9)' }
    ]
  },
  createdAt: Timestamp.now(),
  updatedAt: Timestamp.now()
};

export const MOCK_USERS: User[] = [
  // 1. Developer / System Owner (for app lock control testing)
  {
    uid: 'dev_owner_uid',
    email: 'developer@nabisunsa.ac.ug',
    role: 'system_owner',
    displayName: 'Eng. Mukasa Ronald',
    schoolId: 'nabisunsa_girls',
    createdAt: Timestamp.now()
  },
  // 2. Admin
  {
    uid: 'admin_uid',
    email: 'admin@nabisunsa.ac.ug',
    role: 'admin',
    displayName: 'Hajati Zaminah (Headmistress)',
    schoolId: 'nabisunsa_girls',
    phoneNumber: '+256701123456',
    createdAt: Timestamp.now()
  },
  // 3. Teacher
  {
    uid: 'teacher_uid',
    email: 'teacher@nabisunsa.ac.ug',
    role: 'teacher',
    displayName: 'Mr. Okello James (Physics & Math)',
    schoolId: 'nabisunsa_girls',
    phoneNumber: '+256772987654',
    createdAt: Timestamp.now()
  },
  // 4. O-Level Student & Parent Account (S3 student)
  {
    uid: 'student_o_level_uid',
    email: 'student_o@nabisunsa.ac.ug',
    role: 'student_parent',
    displayName: 'Kembabazi Joanita',
    schoolId: 'nabisunsa_girls',
    createdAt: Timestamp.now(),
    classId: 'S3',
    stream: 'Blue',
    registrationNumber: 'NGSS/2026/087',
    level: 'O-Level',
    subjects: ['o_english', 'o_mathematics', 'o_physics', 'o_chemistry', 'o_biology', 'o_geography', 'o_history', 'o_pe', 'o_ict'],
    parentEmail: 'parent_o@gmail.com',
    parentName: 'Mrs. Kembabazi Beatrice'
  },
  // 5. A-Level Student & Parent Account (S5 student)
  {
    uid: 'student_a_level_uid',
    email: 'student_a@nabisunsa.ac.ug',
    role: 'student_parent',
    displayName: 'Nakato Sarah',
    schoolId: 'nabisunsa_girls',
    createdAt: Timestamp.now(),
    classId: 'S5',
    stream: 'Red',
    registrationNumber: 'NGSS/2025/002',
    level: 'A-Level',
    aLevelCombination: 'PCM',
    subjects: ['a_mathematics', 'a_physics', 'a_chemistry', 'a_general_paper', 'a_sub_ict'],
    parentEmail: 'parent_a@gmail.com',
    parentName: 'Dr. Mukasa Godfrey',
    uceGrades: {
      o_mathematics: 1, // D1
      o_physics: 2,       // D2
      o_chemistry: 2,     // D2
      o_biology: 3,       // C3
      o_english: 1,       // D1
      o_geography: 2,     // D2
      o_history: 1,       // D1
      o_ict: 1            // D1
    }
  },
  // 6. Generic Student & Parent Account (Sarah duplicate for index.tsx quick credentials compatibility)
  {
    uid: 'student_uid',
    email: 'student@nabisunsa.ac.ug',
    role: 'student_parent',
    displayName: 'Nakato Sarah',
    schoolId: 'nabisunsa_girls',
    createdAt: Timestamp.now(),
    classId: 'S5',
    stream: 'Red',
    registrationNumber: 'NGSS/2025/002',
    level: 'A-Level',
    aLevelCombination: 'PCM',
    subjects: ['a_mathematics', 'a_physics', 'a_chemistry', 'a_general_paper', 'a_sub_ict'],
    parentEmail: 'parent_a@gmail.com',
    parentName: 'Dr. Mukasa Godfrey',
    uceGrades: {
      o_mathematics: 1, // D1
      o_physics: 2,       // D2
      o_chemistry: 2,     // D2
      o_biology: 3,       // C3
      o_english: 1,       // D1
      o_geography: 2,     // D2
      o_history: 1,       // D1
      o_ict: 1            // D1
    }
  }
];
