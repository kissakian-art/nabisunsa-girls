import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import {
  DEFAULT_SUBJECTS,
  DEFAULT_COMBINATIONS,
  DEFAULT_COURSES,
  MOCK_SCHOOL_CONFIG,
  MOCK_USERS
} from './seedData';

/**
 * Seeds the Nabisunsa Girls' Secondary School database on Firebase Firestore.
 * This sets up all O-Level and A-Level subjects, higher education combinations,
 * comprehensive university and vocational course databases, and mock accounts.
 */
export async function seedNabisunsaDatabase(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('Starting Firestore database seeding for Nabisunsa...');

    // 1. Seed School Configuration
    console.log('Seeding school config...');
    const schoolRef = doc(db, 'schools', MOCK_SCHOOL_CONFIG.id);
    await setDoc(schoolRef, MOCK_SCHOOL_CONFIG);

    // 2. Seed Subjects (using batch for performance)
    console.log('Seeding subjects...');
    const subjectBatch = writeBatch(db);
    DEFAULT_SUBJECTS.forEach(subject => {
      const ref = doc(db, 'subjects', subject.id);
      subjectBatch.set(ref, subject);
    });
    await subjectBatch.commit();
    console.log(`Successfully seeded ${DEFAULT_SUBJECTS.length} subjects.`);

    // 3. Seed Combinations
    console.log('Seeding combinations...');
    const combBatch = writeBatch(db);
    DEFAULT_COMBINATIONS.forEach(comb => {
      const ref = doc(db, 'combinations', comb.id);
      combBatch.set(ref, comb);
    });
    await combBatch.commit();
    console.log(`Successfully seeded ${DEFAULT_COMBINATIONS.length} combinations.`);

    // 4. Seed University & Vocational Courses
    console.log('Seeding course catalog...');
    const courseBatch = writeBatch(db);
    DEFAULT_COURSES.forEach(course => {
      const ref = doc(db, 'courses', course.id);
      courseBatch.set(ref, course);
    });
    await courseBatch.commit();
    console.log(`Successfully seeded ${DEFAULT_COURSES.length} academic courses & vocational tracks.`);

    // 5. Register accounts in Firebase Authentication FIRST, then seed Firestore profiles
    //    using the REAL Firebase Auth UID (not the hardcoded mock UID).
    //    This is critical — Firebase Auth generates its own UIDs, so Firestore user docs
    //    must be keyed by the Auth UID for getUserProfile(currentUser.uid) to work.
    console.log('Registering accounts in Firebase Auth and seeding user profiles...');
    const { createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
    for (const mockUser of MOCK_USERS) {
      try {
        let firebaseUid: string;

        try {
          // Try to create the Auth account and get its Firebase-generated UID
          const userCredential = await createUserWithEmailAndPassword(auth, mockUser.email, 'nabisunsa123');
          firebaseUid = userCredential.user.uid;
          console.log(`Registered new auth for: ${mockUser.email} (UID: ${firebaseUid})`);
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            // Account already exists — sign in to retrieve its real UID
            const existing = await signInWithEmailAndPassword(auth, mockUser.email, 'nabisunsa123');
            firebaseUid = existing.user.uid;
            console.log(`Auth already exists for: ${mockUser.email} (UID: ${firebaseUid})`);
          } else {
            console.error(`Firebase Auth failed for ${mockUser.email}:`, authError.message || authError);
            // Fallback: use the mock UID if Auth fails completely
            firebaseUid = mockUser.uid;
          }
        }

        // Save the Firestore profile using the REAL Firebase Auth UID
        const userDocRef = doc(db, 'users', firebaseUid);
        await setDoc(userDocRef, { ...mockUser, uid: firebaseUid });
        console.log(`Firestore profile saved for: ${mockUser.displayName} (role: ${mockUser.role})`);

      } catch (seedError: any) {
        console.error(`Failed to seed user ${mockUser.email}:`, seedError.message || seedError);
      }
    }
    console.log(`Successfully processed ${MOCK_USERS.length} accounts (Developer, Admin, Teacher, Students).`);

    return {
      success: true,
      message: 'Nabisunsa database successfully seeded with all standard courses, JAB cutoffs, combinations, subjects, and mock roles!'
    };
  } catch (error: any) {
    console.error('Error seeding Firestore database:', error);
    return {
      success: false,
      message: `Database seeding failed: ${error.message || error}`
    };
  }
}
