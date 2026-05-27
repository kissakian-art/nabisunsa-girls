import {
  calculateUcePoints,
  calculateCourseWeight,
  checkCombinationEligibility,
  getRecommendations,
  UaceMarks
} from '../src/services/careerAdvisor';
import { UceGrade, Course, Combination } from '../src/types';

describe('Ugandan Career Recommendation Engine Tests', () => {
  
  // 1. Test UCE O-Level Point Sums
  describe('calculateUcePoints', () => {
    test('should calculate correct points for standard grades (best 8)', () => {
      const grades: UceGrade[] = [
        { subjectId: 'o_math', subjectName: 'Math', grade: 1 }, // D1 -> 0.3
        { subjectId: 'o_phys', subjectName: 'Physics', grade: 2 }, // D2 -> 0.3
        { subjectId: 'o_chem', subjectName: 'Chemistry', grade: 2 }, // D2 -> 0.3
        { subjectId: 'o_biol', subjectName: 'Biology', grade: 3 }, // C3 -> 0.2
        { subjectId: 'o_engl', subjectName: 'English', grade: 1 }, // D1 -> 0.3
        { subjectId: 'o_geog', subjectName: 'Geography', grade: 4 }, // C4 -> 0.2
        { subjectId: 'o_hist', subjectName: 'History', grade: 5 }, // C5 -> 0.2
        { subjectId: 'o_ict', subjectName: 'ICT', grade: 6 }, // C6 -> 0.2
        { subjectId: 'o_agri', subjectName: 'Agriculture', grade: 8 } // P8 -> 0.1 (Ignored because we take top 8, and we have 8 better grades)
      ];

      // Top 8 grades: 1, 1, 2, 2, 3, 4, 5, 6. (weights: 0.3, 0.3, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2)
      // Sum: 4 * 0.3 + 4 * 0.2 = 1.2 + 0.8 = 2.0
      expect(calculateUcePoints(grades)).toBe(2.0);
    });

    test('should handle failed subjects and return 0 for fails', () => {
      const grades: UceGrade[] = [
        { subjectId: 'o_math', subjectName: 'Math', grade: 9 }, // F9 -> 0
        { subjectId: 'o_phys', subjectName: 'Physics', grade: 9 } // F9 -> 0
      ];
      expect(calculateUcePoints(grades)).toBe(0);
    });
  });

  // 2. Test O-Level Subject Combination Eligibility Checks
  describe('checkCombinationEligibility', () => {
    const pcmCombination: Combination = {
      id: 'PCM',
      name: 'Physics, Chemistry, Mathematics',
      subjects: ['a_physics', 'a_chemistry', 'a_mathematics'],
      uceRequirements: [
        { subjectId: 'o_mathematics', maxGrade: 4 }, // Math must be credit 4 or better
        { subjectId: 'o_physics', maxGrade: 5 },
        { subjectId: 'o_chemistry', maxGrade: 5 }
      ]
    };

    test('should approve eligible student with High confidence', () => {
      const uceGrades = {
        o_mathematics: 1, // D1
        o_physics: 2,       // D2
        o_chemistry: 2      // D2
      };

      const result = checkCombinationEligibility(uceGrades, pcmCombination);
      expect(result.eligible).toBe(true);
      expect(result.confidence).toBe('High');
      expect(result.reasons.length).toBe(0);
    });

    test('should reject student with poor grades in key subjects', () => {
      const uceGrades = {
        o_mathematics: 7, // Pass 7 (requires Credit 4)
        o_physics: 3,
        o_chemistry: 4
      };

      const result = checkCombinationEligibility(uceGrades, pcmCombination);
      expect(result.eligible).toBe(false);
      expect(result.reasons[0]).toContain('requires a maximum grade of C4');
    });
  });

  // 3. Test JAB A-Level University Entry Weight Calculation
  describe('calculateCourseWeight', () => {
    const mockMedicineCourse: Course = {
      id: 'muk_mbchb',
      code: 'MBCHB',
      name: 'Bachelor of Medicine and Bachelor of Surgery',
      institution: 'Makerere University (MUK)',
      institutionType: 'University',
      duration: '5 Years',
      uaceRequirements: {
        essential: ['a_biology', 'a_chemistry'], // essential weighted by 3
        relevant: ['a_physics', 'a_mathematics'],  // relevant weighted by 2
        desirable: ['a_general_paper', 'a_sub_math']
      },
      governmentCutOff: 48.5,
      privateCutOff: 38.0,
      isVocational: false,
      careerDetails: {
        description: 'Elite medicine course.',
        jobs: ['Doctor'],
        averageStartingSalary: 'UGX 3,000,000',
        growthProspects: 'High',
        prospectsReasoning: 'In demand.'
      }
    };

    test('should calculate precise JAB weight score including Nabisunsa female bonus (+1.5)', () => {
      // Mock O-Level contribution (top 8 is D1/D2 in all 8 = 2.4 pts)
      const uceGrades: UceGrade[] = [
        { subjectId: 'o_math', subjectName: 'Math', grade: 1 },
        { subjectId: 'o_phys', subjectName: 'Physics', grade: 1 },
        { subjectId: 'o_chem', subjectName: 'Chemistry', grade: 1 },
        { subjectId: 'o_biol', subjectName: 'Biology', grade: 1 },
        { subjectId: 'o_engl', subjectName: 'English', grade: 1 },
        { subjectId: 'o_geog', subjectName: 'Geography', grade: 1 },
        { subjectId: 'o_hist', subjectName: 'History', grade: 1 },
        { subjectId: 'o_ict', subjectName: 'ICT', grade: 1 }
      ];

      // A-Level Grades: Biology (A = 6), Chemistry (B = 5), Physics (C = 4), GP Passed, Sub-Math Passed
      const uace: UaceMarks = {
        subject1: { id: 'a_biology', grade: 'A' }, // Essential: 6 * 3 = 18.0
        subject2: { id: 'a_chemistry', grade: 'B' }, // Essential: 5 * 3 = 15.0
        subject3: { id: 'a_physics', grade: 'C' }, // Relevant: 4 * 2 = 8.0
        generalPaperPassed: true, // Desirable: +1.0
        subsidiaryPassed: true // Desirable: +1.0
      };

      // Math:
      // UCE Points = 2.4
      // Essential = (Biology: 6 * 3) + (Chemistry: 5 * 3) = 18 + 15 = 33
      // Relevant = (Physics: 4 * 2) = 8
      // Desirable = 2.0
      // Affirmative action = 1.5
      // Total = 2.4 + 33 + 8 + 2.0 + 1.5 = 46.9

      const calc = calculateCourseWeight(uceGrades, uace, mockMedicineCourse);
      expect(calc.totalWeight).toBe(46.9);
      expect(calc.uceContribution).toBe(2.4);
      expect(calc.aLevelWeight).toBe(43.0); // 33 + 8 + 2.0
      expect(calc.affirmativeAction).toBe(1.5);
      expect(calc.breakdown).toContain('Affirmative Action (Nabisunsa Female Entry): +1.5');
    });
  });

  // 4. Test Course Filtering and Eligibility Recommendations
  describe('getRecommendations', () => {
    const mockCourses: Course[] = [
      {
        id: 'muk_mbchb',
        code: 'MBCHB',
        name: 'Bachelor of Medicine',
        institution: 'Makerere',
        institutionType: 'University',
        duration: '5 Years',
        uaceRequirements: {
          essential: ['a_biology', 'a_chemistry'],
          relevant: ['a_physics'],
          desirable: []
        },
        governmentCutOff: 48.0,
        privateCutOff: 38.0,
        isVocational: false,
        careerDetails: { description: '', jobs: [], averageStartingSalary: '', growthProspects: 'High', prospectsReasoning: '' }
      },
      {
        id: 'nvti_mech',
        code: 'MECH',
        name: 'Automobile Certificate',
        institution: 'Nakawa',
        institutionType: 'Institute',
        duration: '1 Year',
        uaceRequirements: { essential: [], relevant: [], desirable: [] },
        isVocational: true,
        careerDetails: { description: '', jobs: [], averageStartingSalary: '', growthProspects: 'High', prospectsReasoning: '' }
      }
    ];

    test('should categorize eligibility and output recommendations', () => {
      const uceGrades: UceGrade[] = [];
      const uace: UaceMarks = {
        subject1: { id: 'a_history', grade: 'A' },
        subject2: { id: 'a_economics', grade: 'B' },
        subject3: { id: 'a_geography', grade: 'C' },
        generalPaperPassed: true,
        subsidiaryPassed: true
      };

      // Since student takes History/Economics/Geography, they lack both "a_biology" and "a_chemistry" which are essential for medicine.
      // They should be marked as "Ineligible" for Medicine.
      // They should get "High" eligibility for the Vocational Automobile Certificate since it has isVocational: true.
      const recs = getRecommendations(uceGrades, uace, mockCourses);
      
      const medRec = recs.find(r => r.course.id === 'muk_mbchb');
      const vocRec = recs.find(r => r.course.id === 'nvti_mech');

      expect(medRec?.eligibility).toBe('Ineligible');
      expect(medRec?.reason).toContain('does not include any of the essential subjects');

      expect(vocRec?.eligibility).toBe('High');
      expect(vocRec?.confidenceScore).toBe(95);
    });
  });
});
