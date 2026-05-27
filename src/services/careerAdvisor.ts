import { UceGrade, Course, Subject, Combination } from '../types';

export interface UaceMarks {
  subject1: { id: string; grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'O' | 'F' };
  subject2: { id: string; grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'O' | 'F' };
  subject3: { id: string; grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'O' | 'F' };
  generalPaperPassed: boolean;
  subsidiaryPassed: boolean; // Subsidiary Mathematics or Subsidiary Computer Studies (Sub-ICT)
}

export const GRADE_POINTS: Record<string, number> = {
  A: 6,
  B: 5,
  C: 4,
  D: 3,
  E: 2,
  O: 1, // Subsidiary pass
  F: 0,
};

/**
 * Calculates the total O-Level (UCE) points contribution for JAB university admissions.
 * Takes the best 8 subjects' grades. 
 * Distinctions (1, 2) = 0.3 points each
 * Credits (3, 4, 5, 6) = 0.2 points each
 * Passes (7, 8) = 0.1 points each
 * Fails (9) = 0.0 points
 */
export function calculateUcePoints(grades: UceGrade[]): number {
  if (!grades || grades.length === 0) return 0;

  // Filter out any invalid grades and sort by grade (lower number is better, e.g. D1 is 1)
  const validGrades = grades
    .filter(g => g.grade >= 1 && g.grade <= 9)
    .sort((a, b) => a.grade - b.grade);

  // Take top 8 subjects
  const best8 = validGrades.slice(0, 8);

  const totalPoints = best8.reduce((sum, item) => {
    if (item.grade <= 2) return sum + 0.3; // D1, D2
    if (item.grade <= 6) return sum + 0.2; // C3 - C6
    if (item.grade <= 8) return sum + 0.1; // P7, P8
    return sum;
  }, 0);

  return parseFloat(totalPoints.toFixed(2));
}

/**
 * Checks if an O-Level student qualifies for specific A-Level subject combinations
 * based on standard Ugandan school entry requirements.
 */
export function checkCombinationEligibility(
  uceGradesMap: Record<string, number>, // Hashed subjectId -> grade (1-9)
  combination: Combination
): { eligible: boolean; confidence: 'High' | 'Medium' | 'Low'; reasons: string[] } {
  const reasons: string[] = [];
  let isEligible = true;
  let distinctionCount = 0;
  let creditCount = 0;

  for (const req of combination.uceRequirements) {
    const grade = uceGradesMap[req.subjectId];
    if (grade === undefined) {
      isEligible = false;
      reasons.push(`Missing required O-Level subject: ${req.subjectId.toUpperCase()}`);
      continue;
    }

    if (grade > req.maxGrade) {
      isEligible = false;
      reasons.push(
        `Grade for ${req.subjectId.toUpperCase()} is C${grade} or P${grade}, but requires a maximum grade of C${req.maxGrade} or better.`
      );
    }

    if (grade <= 2) {
      distinctionCount++;
    } else if (grade <= 6) {
      creditCount++;
    }
  }

  // Calculate confidence score based on overall performance in the combination subjects
  let confidence: 'High' | 'Medium' | 'Low' = 'Low';
  if (isEligible) {
    const subjectCount = combination.subjects.length;
    if (distinctionCount === subjectCount) {
      confidence = 'High';
    } else if (distinctionCount + creditCount === subjectCount && distinctionCount >= 1) {
      confidence = 'Medium';
    } else {
      confidence = 'Low';
    }
  }

  return { eligible: isEligible, confidence, reasons };
}

/**
 * Calculates the combined JAB admission weight for a specific university course.
 * Employs Ugandan university weights: Essential (weight 3), Relevant (weight 2),
 * Desirable (weight 1), Others (weight 0.5).
 * Automatically adds the Nabisunsa Girls' Secondary School female bonus of +1.5 points.
 */
export function calculateCourseWeight(
  uceGrades: UceGrade[],
  uace: UaceMarks,
  course: Course
): {
  totalWeight: number;
  uceContribution: number;
  aLevelWeight: number;
  affirmativeAction: number;
  breakdown: string[];
} {
  const uceContribution = calculateUcePoints(uceGrades);
  const breakdown: string[] = [];

  breakdown.push(`UCE Points (Best 8): +${uceContribution.toFixed(2)}`);

  let aLevelWeight = 0;
  const principalSubjects = [uace.subject1, uace.subject2, uace.subject3];
  
  // Track mapped principal subjects to avoid double weighting
  const essentialMatches: string[] = [];
  const relevantMatches: string[] = [];

  principalSubjects.forEach(sub => {
    const pts = GRADE_POINTS[sub.grade] || 0;
    const subName = sub.id.toUpperCase();

    // 1. Check Essential Subjects (weight 3)
    if (
      course.uaceRequirements.essential.includes(sub.id) &&
      essentialMatches.length < 2
    ) {
      const weight = pts * 3;
      aLevelWeight += weight;
      essentialMatches.push(sub.id);
      breakdown.push(`Essential: ${subName} (${sub.grade}) * 3 = +${weight.toFixed(1)}`);
    } 
    // 2. Check Relevant Subjects (weight 2)
    else if (
      course.uaceRequirements.relevant.includes(sub.id) &&
      relevantMatches.length < 1
    ) {
      const weight = pts * 2;
      aLevelWeight += weight;
      relevantMatches.push(sub.id);
      breakdown.push(`Relevant: ${subName} (${sub.grade}) * 2 = +${weight.toFixed(1)}`);
    } 
    // 3. Others (weight 0.5)
    else {
      const weight = pts * 0.5;
      aLevelWeight += weight;
      breakdown.push(`Other Principal: ${subName} (${sub.grade}) * 0.5 = +${weight.toFixed(1)}`);
    }
  });

  // Desirable subjects: General paper (GP) and Subsidiary passed (weight 1.0 each)
  if (uace.generalPaperPassed) {
    aLevelWeight += 1.0;
    breakdown.push(`Desirable: General Paper Pass = +1.0`);
  } else {
    breakdown.push(`Desirable: General Paper Fail/Absent = +0.0`);
  }

  if (uace.subsidiaryPassed) {
    aLevelWeight += 1.0;
    breakdown.push(`Desirable: Subsidiary (Math/ICT) Pass = +1.0`);
  } else {
    breakdown.push(`Desirable: Subsidiary (Math/ICT) Fail/Absent = +0.0`);
  }

  // Affirmative Action: 1.5 points for Nabisunsa Girls
  const affirmativeAction = 1.5;
  breakdown.push(`Affirmative Action (Nabisunsa Female Entry): +${affirmativeAction.toFixed(1)}`);

  const totalWeight = parseFloat((uceContribution + aLevelWeight + affirmativeAction).toFixed(2));

  return {
    totalWeight,
    uceContribution,
    aLevelWeight,
    affirmativeAction,
    breakdown,
  };
}

export interface RecommendationResult {
  course: Course;
  totalWeight: number;
  eligibility: 'High' | 'Medium' | 'Borderline' | 'Ineligible';
  confidenceScore: number; // 0 to 100
  reason: string;
  breakdown: string[];
}

/**
 * Computes recommendations across the entire course database for a student's marks.
 */
export function getRecommendations(
  uceGrades: UceGrade[],
  uace: UaceMarks,
  courses: Course[]
): RecommendationResult[] {
  const results: RecommendationResult[] = [];

  const uaceSubjectIds = [uace.subject1.id, uace.subject2.id, uace.subject3.id];

  for (const course of courses) {
    // 1. Verify Essential subject requirements:
    // A course might require specific essential subjects (e.g. Mathematics and Physics for Engineering).
    // The student must take at least one (or both depending on course) principal essential subject to be eligible.
    // If the student doesn't take any essential subjects, they are automatically ineligible.
    const hasEssential = course.uaceRequirements.essential.some(subId =>
      uaceSubjectIds.includes(subId)
    );

    if (!hasEssential && !course.isVocational) {
      results.push({
        course,
        totalWeight: 0,
        eligibility: 'Ineligible',
        confidenceScore: 0,
        reason: `Your A-Level combination does not include any of the essential subjects: ${course.uaceRequirements.essential
          .map(s => s.toUpperCase())
          .join(', ')}.`,
        breakdown: ['Ineligible due to missing essential subjects.'],
      });
      continue;
    }

    // 2. Perform weight calculation
    const calc = calculateCourseWeight(uceGrades, uace, course);
    const weight = calc.totalWeight;

    // 3. Determine eligibility based on cutoffs
    let eligibility: 'High' | 'Medium' | 'Borderline' | 'Ineligible' = 'Ineligible';
    let reason = '';
    let confidenceScore = 0;

    // Direct Entry system mapping for other universities
    const directEntryUniversities = [
      'Mbarara University', 'MUST', 'Gulu University', 'Busitema University', 
      'Kampala International University', 'KIU', 'Uganda Christian University', 'UCU', 
      'Uganda Martyrs University', 'UMU', 'Islamic University in Uganda', 'IUIU', 
      'International University of East Africa', 'IUEA'
    ];
    
    const isDirectEntryUni = directEntryUniversities.some(uni => 
      course.institution.toLowerCase().includes(uni.toLowerCase())
    );

    if (isDirectEntryUni) {
      // Direct Entry check: Requires ≥ 2 UACE Principal Passes (A, B, C, D, E) and ≥ 5 UCE passes (1 to 8)
      const principalGrades = ['A', 'B', 'C', 'D', 'E'];
      let principalPassCount = 0;
      if (principalGrades.includes(uace.subject1.grade)) principalPassCount++;
      if (principalGrades.includes(uace.subject2.grade)) principalPassCount++;
      if (principalGrades.includes(uace.subject3.grade)) principalPassCount++;

      const ucePassCount = uceGrades.filter(g => g.grade >= 1 && g.grade <= 8).length;
      const qualifiesDirectEntry = principalPassCount >= 2 && ucePassCount >= 5;

      if (qualifiesDirectEntry) {
        eligibility = 'High';
        confidenceScore = 95;
        reason = `Direct Entry Admissible! You qualify for admission at ${course.institution} under their Direct Entry system, having scored ${principalPassCount} Principal Passes at UACE (requires ≥2) and ${ucePassCount} UCE passes (requires ≥5).`;
      } else {
        eligibility = 'Ineligible';
        confidenceScore = 20;
        reason = `Direct Entry requirements pending. ${course.institution} requires at least 2 Principal Passes at UACE (you have ${principalPassCount}) and at least 5 passes at UCE (you have ${ucePassCount}).`;
      }
    } else if (course.isVocational) {
      // Vocational courses are skills-focused and generally depend on interest and basic pass thresholds, not rigid JAB weights.
      eligibility = 'High';
      confidenceScore = 95;
      reason = `This skills-based vocational course is highly recommended to build specialized hands-on competence in ${course.name}.`;
    } else {
      const govCutoff = course.governmentCutOff || 48.0;
      const privCutoff = course.privateCutOff || 35.0;

      if (weight >= govCutoff) {
        eligibility = 'High';
        confidenceScore = Math.min(100, Math.round(90 + (weight - govCutoff) * 5));
        reason = `Excellent fit! Your weight score of ${weight.toFixed(2)} exceeds the government sponsorship cutoff of ${govCutoff.toFixed(
          2
        )} at ${course.institution}. You have highly favorable admission prospects.`;
      } else if (weight >= privCutoff) {
        eligibility = 'Medium';
        confidenceScore = Math.min(89, Math.round(60 + ((weight - privCutoff) / (govCutoff - privCutoff)) * 30));
        reason = `Good fit! Your score of ${weight.toFixed(2)} meets the private sponsorship cutoff of ${privCutoff.toFixed(
          2
        )}. You are eligible to apply under private admission.`;
      } else if (weight >= privCutoff - 3.0) {
        eligibility = 'Borderline';
        confidenceScore = Math.round(40 + (weight - (privCutoff - 3.0)) * 6);
        reason = `Aspirant status. Your score of ${weight.toFixed(2)} is close to the private cutoff of ${privCutoff.toFixed(
          2
        )}. Boosting your performance slightly in test exams will secure an admission ticket.`;
      } else {
        eligibility = 'Ineligible';
        confidenceScore = Math.round(Math.max(10, (weight / privCutoff) * 35));
        reason = `Your score of ${weight.toFixed(2)} is below the required threshold of ${privCutoff.toFixed(
          2
        )} for private entry. We suggest looking at related vocational certificates or alternative courses.`;
      }
    }

    results.push({
      course,
      totalWeight: weight,
      eligibility,
      confidenceScore,
      reason,
      breakdown: calc.breakdown,
    });
  }

  // Sort: Vocational and Higher Eligibility first, then by totalWeight descending
  return results.sort((a, b) => {
    if (a.eligibility === b.eligibility) {
      return b.totalWeight - a.totalWeight;
    }
    const order = { High: 0, Medium: 1, Borderline: 2, Ineligible: 3 };
    return order[a.eligibility] - order[b.eligibility];
  });
}
