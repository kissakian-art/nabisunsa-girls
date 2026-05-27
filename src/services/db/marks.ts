import { doc, getDoc, setDoc, getDocs, collection, query, where, writeBatch, Timestamp } from 'firebase/firestore';
import { db, isMockMode } from '../firebase';
import { Marks, SchoolConfig, GradingScaleEntry } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Pre-seeded academic marks to populate student dashboards instantly in mock mode
const SEEDED_MOCK_MARKS: Marks[] = [
  // Student Joanita S3 (O-Level)
  { studentId: 'student_o_level_uid', subjectId: 'o_english', termId: '2026_term1', classId: 'S3', beginningOfTerm: 82, midTerm: 85, endOfTerm: 80, continuousAssessment: 85, finalWeightScore: 81.00, finalGrade: 'A', remarks: 'Excellent linguistic skills.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_o_level_uid', subjectId: 'o_mathematics', termId: '2026_term1', classId: 'S3', beginningOfTerm: 70, midTerm: 72, endOfTerm: 75, continuousAssessment: 78, finalWeightScore: 75.60, finalGrade: 'B', remarks: 'Good analytical capacity.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_o_level_uid', subjectId: 'o_physics', termId: '2026_term1', classId: 'S3', beginningOfTerm: 65, midTerm: 68, endOfTerm: 70, continuousAssessment: 72, finalWeightScore: 70.40, finalGrade: 'B', remarks: 'Shows progress.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_o_level_uid', subjectId: 'o_chemistry', termId: '2026_term1', classId: 'S3', beginningOfTerm: 58, midTerm: 62, endOfTerm: 60, continuousAssessment: 65, finalWeightScore: 61.00, finalGrade: 'C', remarks: 'Can perform better.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_o_level_uid', subjectId: 'o_biology', termId: '2026_term1', classId: 'S3', beginningOfTerm: 62, midTerm: 60, endOfTerm: 65, continuousAssessment: 70, finalWeightScore: 66.00, finalGrade: 'C', remarks: 'Solid effort.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_o_level_uid', subjectId: 'o_geography', termId: '2026_term1', classId: 'S3', beginningOfTerm: 78, midTerm: 80, endOfTerm: 78, continuousAssessment: 82, finalWeightScore: 78.80, finalGrade: 'B', remarks: 'Vibrant participation.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_o_level_uid', subjectId: 'o_history', termId: '2026_term1', classId: 'S3', beginningOfTerm: 85, midTerm: 88, endOfTerm: 85, continuousAssessment: 90, finalWeightScore: 86.00, finalGrade: 'A', remarks: 'Outstanding work.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  
  // Student Sarah S5 (A-Level PCM)
  { studentId: 'student_a_level_uid', subjectId: 'a_mathematics', termId: '2026_term1', classId: 'S5', beginningOfTerm: 85, midTerm: 88, endOfTerm: 85, continuousAssessment: 90, finalWeightScore: 86.00, finalGrade: 'A', remarks: 'Superb mathematical precision.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_a_level_uid', subjectId: 'a_physics', termId: '2026_term1', classId: 'S5', beginningOfTerm: 80, midTerm: 82, endOfTerm: 78, continuousAssessment: 85, finalWeightScore: 79.40, finalGrade: 'B', remarks: 'Excellent lab deductions.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_a_level_uid', subjectId: 'a_chemistry', termId: '2026_term1', classId: 'S5', beginningOfTerm: 75, midTerm: 78, endOfTerm: 75, continuousAssessment: 80, finalWeightScore: 76.00, finalGrade: 'B', remarks: 'Very competent.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_a_level_uid', subjectId: 'a_general_paper', termId: '2026_term1', classId: 'S5', beginningOfTerm: 70, midTerm: 72, endOfTerm: 75, continuousAssessment: 75, finalWeightScore: 75.00, finalGrade: 'B', remarks: 'Insightful essay arguments.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
  { studentId: 'student_a_level_uid', subjectId: 'a_sub_ict', termId: '2026_term1', classId: 'S5', beginningOfTerm: 90, midTerm: 92, endOfTerm: 90, continuousAssessment: 95, finalWeightScore: 91.00, finalGrade: 'A', remarks: 'Strong IT skills.', recordedBy: 'teacher_uid', updatedAt: Timestamp.now() },
];

async function getMockMarksList(): Promise<Marks[]> {
  try {
    const stored = await AsyncStorage.getItem('mock_all_marks');
    if (stored) return JSON.parse(stored) as Marks[];
    await AsyncStorage.setItem('mock_all_marks', JSON.stringify(SEEDED_MOCK_MARKS));
    return SEEDED_MOCK_MARKS;
  } catch (e) {
    return SEEDED_MOCK_MARKS;
  }
}

async function saveMockMarksList(list: Marks[]): Promise<void> {
  try {
    await AsyncStorage.setItem('mock_all_marks', JSON.stringify(list));
  } catch (e) {
    console.error('Error saving mock marks:', e);
  }
}

// Helper: Maps a score to the Ugandan/Custom school grading scale
export function determineGrade(score: number, scale: GradingScaleEntry[]): string {
  const sortedScale = [...scale].sort((a, b) => b.minScore - a.minScore);
  for (const entry of sortedScale) {
    if (score >= entry.minScore) {
      return entry.grade;
    }
  }
  return 'F';
}

/**
 * Calculates and records the academic marks for a specific student.
 * Integrates school grading weights (e.g., 20% Coursework + 80% EOT Exam).
 */
export async function saveStudentMarks(
  studentId: string,
  subjectId: string,
  termId: string,
  classId: string,
  marksData: {
    beginningOfTerm?: number;
    midTerm?: number;
    endOfTerm?: number;
    continuousAssessment?: number;
    remarks?: string;
  },
  recordedBy: string,
  schoolConfig?: SchoolConfig
): Promise<Marks> {
  if (isMockMode) {
    const list = await getMockMarksList();
    const weights = schoolConfig?.gradingSystem?.weights || { continuousAssessment: 20, endOfTerm: 80 };
    const scale = schoolConfig?.gradingSystem?.scale || [
      { grade: 'A', minScore: 80, label: 'Distinction' },
      { grade: 'B', minScore: 70, label: 'Credit' },
      { grade: 'C', minScore: 60, label: 'Credit' },
      { grade: 'D', minScore: 50, label: 'Pass' },
      { grade: 'E', minScore: 40, label: 'Pass' },
      { grade: 'O', minScore: 30, label: 'Subsidiary' },
      { grade: 'F', minScore: 0, label: 'Failure' }
    ];
    const caWeight = weights.continuousAssessment / 100;
    const eotWeight = weights.endOfTerm / 100;
    const ca = marksData.continuousAssessment !== undefined ? marksData.continuousAssessment : 0;
    const eot = marksData.endOfTerm !== undefined ? marksData.endOfTerm : 0;
    const finalWeightScore = parseFloat(((ca * caWeight) + (eot * eotWeight)).toFixed(2));
    const finalGrade = determineGrade(finalWeightScore, scale);

    const newRecord: Marks = {
      studentId,
      subjectId,
      termId,
      classId,
      beginningOfTerm: marksData.beginningOfTerm,
      midTerm: marksData.midTerm,
      endOfTerm: marksData.endOfTerm,
      continuousAssessment: ca,
      finalWeightScore,
      finalGrade,
      remarks: marksData.remarks || '',
      recordedBy,
      updatedAt: new Date() as any,
    };

    const filtered = list.filter(m => !(m.studentId === studentId && m.subjectId === subjectId && m.termId === termId));
    filtered.push(newRecord);
    await saveMockMarksList(filtered);
    return newRecord;
  }

  try {
    let activeConfig = schoolConfig;
    
    // Fetch school config if not provided, to retrieve weights and scale
    if (!activeConfig) {
      const configRef = doc(db, 'schools', 'nabisunsa_girls');
      const configSnap = await getDoc(configRef);
      if (configSnap.exists()) {
        activeConfig = configSnap.data() as SchoolConfig;
      }
    }

    const weights = activeConfig?.gradingSystem?.weights || { continuousAssessment: 20, endOfTerm: 80 };
    const scale = activeConfig?.gradingSystem?.scale || [
      { grade: 'A', minScore: 80, label: 'Distinction' },
      { grade: 'B', minScore: 70, label: 'Credit' },
      { grade: 'C', minScore: 60, label: 'Credit' },
      { grade: 'D', minScore: 50, label: 'Pass' },
      { grade: 'E', minScore: 40, label: 'Pass' },
      { grade: 'O', minScore: 30, label: 'Subsidiary' },
      { grade: 'F', minScore: 0, label: 'Failure' }
    ];

    const caWeight = weights.continuousAssessment / 100;
    const eotWeight = weights.endOfTerm / 100;

    const ca = marksData.continuousAssessment !== undefined ? marksData.continuousAssessment : 0;
    const eot = marksData.endOfTerm !== undefined ? marksData.endOfTerm : 0;

    // Ugandan weighted formula: coursework + EOT
    const finalWeightScore = parseFloat(((ca * caWeight) + (eot * eotWeight)).toFixed(2));
    const finalGrade = determineGrade(finalWeightScore, scale);

    const docId = `${studentId}_${termId}_${subjectId}`;
    const marksRef = doc(db, 'marks', docId);

    const finalMarks: Marks = {
      studentId,
      subjectId,
      termId,
      classId,
      beginningOfTerm: marksData.beginningOfTerm,
      midTerm: marksData.midTerm,
      endOfTerm: marksData.endOfTerm,
      continuousAssessment: ca,
      finalWeightScore,
      finalGrade,
      remarks: marksData.remarks || '',
      recordedBy,
      updatedAt: Timestamp.now(),
    };

    await setDoc(marksRef, finalMarks, { merge: true });
    return finalMarks;
  } catch (error) {
    console.error('Error saving student marks:', error);
    throw error;
  }
}

/**
 * Retrieves the marks recorded for a student during a specific term.
 */
export async function getStudentMarksForTerm(studentId: string, termId: string): Promise<Marks[]> {
  if (isMockMode) {
    const list = await getMockMarksList();
    return list.filter(m => m.studentId === studentId && m.termId === termId);
  }

  try {
    const marksRef = collection(db, 'marks');
    const q = query(
      marksRef,
      where('studentId', '==', studentId),
      where('termId', '==', termId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Marks);
  } catch (error) {
    console.error('Error fetching student marks for term:', error);
    throw error;
  }
}

/**
 * Retrieves marks across an entire class for a particular subject and term.
 * Crucial for displaying scores on the Bulk Marks Entry form.
 */
export async function getClassMarksForTerm(
  classId: string,
  subjectId: string,
  termId: string
): Promise<Marks[]> {
  if (isMockMode) {
    const list = await getMockMarksList();
    return list.filter(m => m.classId === classId && m.subjectId === subjectId && m.termId === termId);
  }

  try {
    const marksRef = collection(db, 'marks');
    const q = query(
      marksRef,
      where('classId', '==', classId),
      where('subjectId', '==', subjectId),
      where('termId', '==', termId)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Marks);
  } catch (error) {
    console.error('Error fetching class marks for term:', error);
    throw error;
  }
}

/**
 * Saves marks for multiple students simultaneously in a single Firestore batch.
 * Guarantees optimal performance and transactional safety for Bulk Marks Entry.
 */
export async function saveBulkMarks(
  termId: string,
  classId: string,
  subjectId: string,
  marksList: Array<{
    studentId: string;
    beginningOfTerm?: number;
    midTerm?: number;
    endOfTerm?: number;
    continuousAssessment?: number;
    remarks?: string;
  }>,
  recordedBy: string
): Promise<void> {
  if (isMockMode) {
    const list = await getMockMarksList();
    const weights = { continuousAssessment: 20, endOfTerm: 80 };
    const scale = [
      { grade: 'A', minScore: 80, label: 'Distinction' },
      { grade: 'B', minScore: 70, label: 'Credit' },
      { grade: 'C', minScore: 60, label: 'Credit' },
      { grade: 'D', minScore: 50, label: 'Pass' },
      { grade: 'E', minScore: 40, label: 'Pass' },
      { grade: 'O', minScore: 30, label: 'Subsidiary' },
      { grade: 'F', minScore: 0, label: 'Failure' }
    ];
    const caWeight = weights.continuousAssessment / 100;
    const eotWeight = weights.endOfTerm / 100;

    let updatedList = [...list];

    marksList.forEach(item => {
      const ca = item.continuousAssessment !== undefined ? item.continuousAssessment : 0;
      const eot = item.endOfTerm !== undefined ? item.endOfTerm : 0;
      const finalWeightScore = parseFloat(((ca * caWeight) + (eot * eotWeight)).toFixed(2));
      const finalGrade = determineGrade(finalWeightScore, scale);

      const record: Marks = {
        studentId: item.studentId,
        subjectId,
        termId,
        classId,
        beginningOfTerm: item.beginningOfTerm,
        midTerm: item.midTerm,
        endOfTerm: item.endOfTerm,
        continuousAssessment: ca,
        finalWeightScore,
        finalGrade,
        remarks: item.remarks || '',
        recordedBy,
        updatedAt: new Date() as any,
      };

      updatedList = updatedList.filter(m => !(m.studentId === item.studentId && m.subjectId === subjectId && m.termId === termId));
      updatedList.push(record);
    });

    await saveMockMarksList(updatedList);
    return;
  }

  try {
    // Retrieve the school config for calculations
    const configRef = doc(db, 'schools', 'nabisunsa_girls');
    const configSnap = await getDoc(configRef);
    const activeConfig = configSnap.exists() ? (configSnap.data() as SchoolConfig) : undefined;

    const weights = activeConfig?.gradingSystem?.weights || { continuousAssessment: 20, endOfTerm: 80 };
    const scale = activeConfig?.gradingSystem?.scale || [
      { grade: 'A', minScore: 80, label: 'Distinction' },
      { grade: 'B', minScore: 70, label: 'Credit' },
      { grade: 'C', minScore: 60, label: 'Credit' },
      { grade: 'D', minScore: 50, label: 'Pass' },
      { grade: 'E', minScore: 40, label: 'Pass' },
      { grade: 'O', minScore: 30, label: 'Subsidiary' },
      { grade: 'F', minScore: 0, label: 'Failure' }
    ];

    const caWeight = weights.continuousAssessment / 100;
    const eotWeight = weights.endOfTerm / 100;

    const batch = writeBatch(db);

    marksList.forEach(item => {
      const ca = item.continuousAssessment !== undefined ? item.continuousAssessment : 0;
      const eot = item.endOfTerm !== undefined ? item.endOfTerm : 0;

      const finalWeightScore = parseFloat(((ca * caWeight) + (eot * eotWeight)).toFixed(2));
      const finalGrade = determineGrade(finalWeightScore, scale);

      const docId = `${item.studentId}_${termId}_${subjectId}`;
      const docRef = doc(db, 'marks', docId);

      const marksRecord: Marks = {
        studentId: item.studentId,
        subjectId,
        termId,
        classId,
        beginningOfTerm: item.beginningOfTerm,
        midTerm: item.midTerm,
        endOfTerm: item.endOfTerm,
        continuousAssessment: ca,
        finalWeightScore,
        finalGrade,
        remarks: item.remarks || '',
        recordedBy,
        updatedAt: Timestamp.now(),
      };

      batch.set(docRef, marksRecord, { merge: true });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error saving bulk marks:', error);
    throw error;
  }
}
