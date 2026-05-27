import { collection, getDocs, doc, setDoc, query, where, Timestamp } from 'firebase/firestore';
import { db, isMockMode } from '../firebase';
import { Lesson } from '../../types';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MOCK_LESSONS: Lesson[] = [
  {
    id: 'lesson_math_1',
    teacherId: 'teacher_uid',
    subjectId: 'a_mathematics',
    classId: 'S5',
    termId: '2026_term1',
    topic: 'Calculus & Integration',
    title: 'Introduction to First Principles',
    googleDriveId: '12345ABCDE_gdrive_id',
    pdfAttachmentUrl: 'calculus_intro.pdf',
    commentCount: 4,
    createdAt: Timestamp.now() as any
  },
  {
    id: 'lesson_phys_1',
    teacherId: 'teacher_uid',
    subjectId: 'a_physics',
    classId: 'S5',
    termId: '2026_term1',
    topic: 'Mechanics & Motion',
    title: "Understanding Newton's Second Law",
    googleDriveId: '67890XYZ_gdrive_id',
    pdfAttachmentUrl: 'mechanics_newton.pdf',
    commentCount: 2,
    createdAt: Timestamp.now() as any
  },
  {
    id: 'lesson_chem_1',
    teacherId: 'teacher_uid',
    subjectId: 'a_chemistry',
    classId: 'S5',
    termId: '2026_term1',
    topic: 'Physical Chemistry',
    title: 'Volumetric Analysis & Titration Curve',
    googleDriveId: 'chem_titrate_id',
    pdfAttachmentUrl: 'titration_vol.pdf',
    commentCount: 0,
    createdAt: Timestamp.now() as any
  }
];

export async function getLessons(schoolId: string): Promise<Lesson[]> {
  if (isMockMode) {
    try {
      const stored = await AsyncStorage.getItem(`mock_lessons_${schoolId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as Lesson[];
        return parsed;
      }
      await AsyncStorage.setItem(`mock_lessons_${schoolId}`, JSON.stringify(MOCK_LESSONS));
      return MOCK_LESSONS;
    } catch (e) {
      console.error('Error fetching mock lessons:', e);
      return MOCK_LESSONS;
    }
  }

  try {
    const q = query(collection(db, 'lessons'), where('schoolId', '==', schoolId));
    const snap = await getDocs(q);
    const dbLessons = snap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
      } as Lesson;
    });
    if (dbLessons.length === 0) {
      return MOCK_LESSONS;
    }
    return dbLessons;
  } catch (error) {
    console.error('Error fetching lessons:', error);
    return MOCK_LESSONS;
  }
}

export async function saveLesson(schoolId: string, lesson: Lesson): Promise<void> {
  if (isMockMode) {
    try {
      const current = await getLessons(schoolId);
      const updated = [lesson, ...current];
      await AsyncStorage.setItem(`mock_lessons_${schoolId}`, JSON.stringify(updated));
      return;
    } catch (e) {
      console.error('Error saving mock lesson:', e);
      throw e;
    }
  }

  try {
    const ref = doc(db, 'lessons', lesson.id);
    await setDoc(ref, { ...lesson, schoolId });
  } catch (error) {
    console.error('Error saving lesson:', error);
    throw error;
  }
}
