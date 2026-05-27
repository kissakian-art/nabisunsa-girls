import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db, isMockMode } from '../firebase';
import { Course } from '../../types';
import { DEFAULT_COURSES } from '../../scripts/seedData';

/**
 * Retrieves the full database of Ugandan university and vocational courses.
 */
export async function getCourses(): Promise<Course[]> {
  if (isMockMode) {
    return DEFAULT_COURSES;
  }

  try {
    const coursesRef = collection(db, 'courses');
    const snap = await getDocs(coursesRef);
    return snap.docs.map(d => d.data() as Course);
  } catch (error) {
    console.error('Error fetching courses list:', error);
    throw error;
  }
}

/**
 * Retrieves details for a specific course by its unique ID.
 */
export async function getCourseById(courseId: string): Promise<Course | null> {
  if (isMockMode) {
    return DEFAULT_COURSES.find(c => c.id === courseId) || null;
  }

  try {
    const courseRef = doc(db, 'courses', courseId);
    const snap = await getDoc(courseRef);
    if (snap.exists()) {
      return snap.data() as Course;
    }
    return null;
  } catch (error) {
    console.error('Error fetching course details:', error);
    throw error;
  }
}

/**
 * Retrieves courses filtered by university or institute.
 */
export async function getCoursesByInstitution(institution: string): Promise<Course[]> {
  if (isMockMode) {
    return DEFAULT_COURSES.filter(c => c.institution === institution);
  }

  try {
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, where('institution', '==', institution));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Course);
  } catch (error) {
    console.error('Error fetching courses by institution:', error);
    throw error;
  }
}

/**
 * Retrieves vocational courses specifically aimed at hands-on skills training.
 */
export async function getVocationalCourses(): Promise<Course[]> {
  if (isMockMode) {
    return DEFAULT_COURSES.filter(c => c.isVocational === true);
  }

  try {
    const coursesRef = collection(db, 'courses');
    const q = query(coursesRef, where('isVocational', '==', true));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as Course);
  } catch (error) {
    console.error('Error fetching vocational courses:', error);
    throw error;
  }
}
