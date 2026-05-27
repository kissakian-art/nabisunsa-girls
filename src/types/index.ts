import { Timestamp } from 'firebase/firestore';

export type UserRole = 'system_owner' | 'admin' | 'teacher' | 'student_parent';

export interface BaseUser {
  uid: string;
  email: string;
  role: UserRole;
  displayName: string;
  photoUrl?: string;
  schoolId: string;
  phoneNumber?: string;
  createdAt: Timestamp;
}

export interface UceGrade {
  subjectId: string;
  subjectName: string;
  grade: number; // 1 (D1) to 9 (F9)
}

export interface StudentParentFields {
  classId: string; // e.g., 'S1', 'S3', 'S5'
  stream: string;  // e.g., 'Blue', 'Red'
  registrationNumber: string; // e.g., 'NGSS/2026/042'
  level: 'O-Level' | 'A-Level';
  aLevelCombination?: string; // e.g., 'PCM', 'HEG' (null for O-Level)
  subjects: string[]; // List of registered subject IDs
  parentEmail?: string;
  parentName?: string;
  uceGrades?: Record<string, number>; // Hashed subjectId -> gradeNumber (for S5/S6 students)
}

export type User = BaseUser & Partial<StudentParentFields>;

export interface Subject {
  id: string; // Document ID, e.g., 'mathematics', 'physics'
  name: string;
  code: string; // e.g., 'MTC', 'PHY'
  level: 'O-Level' | 'A-Level';
  category: 'Science' | 'Arts' | 'Language' | 'Technical';
  isDefault: boolean; // Predefined by default Ugandan curriculum
  schoolId: string; // 'nabisunsa_girls' or 'system' (global defaults)
}

export interface UceRequirement {
  subjectId: string;
  maxGrade: number; // Maximum point allowed (lower is better, e.g., Credit 4 is <= 4)
}

export interface Combination {
  id: string; // e.g., 'PCM', 'HEG'
  name: string;
  subjects: string[]; // Subject IDs, e.g., ['physics', 'chemistry', 'mathematics']
  uceRequirements: UceRequirement[]; // Grade thresholds to qualify
}

export interface CareerDetails {
  description: string;
  jobs: string[];
  averageStartingSalary: string;
  growthProspects: 'High' | 'Medium' | 'Low';
  prospectsReasoning: string;
}

export interface UaceRequirements {
  essential: string[]; // Subjects weighted by 3 (Max 2, e.g., ['mathematics', 'physics'])
  relevant: string[];  // Subjects weighted by 2 (Max 1, e.g., ['chemistry', 'economics'])
  desirable: string[]; // Weighted by 1 (e.g., ['general_paper', 'subsidiary_math'])
}

export interface Course {
  id: string; // Document ID
  code: string; // e.g., 'CIV', 'MBCHB'
  name: string; // e.g., 'Bachelor of Science in Civil Engineering'
  institution: string; // e.g., 'Makerere University', 'Nakawa Vocational Training Institute'
  institutionType: 'University' | 'Institute' | 'College';
  duration: string; // e.g., '4 Years', '2 Years'
  uaceRequirements: UaceRequirements;
  uceRequirements?: UceRequirement[];
  governmentCutOff?: number;
  privateCutOff?: number;
  careerDetails: CareerDetails;
  isVocational: boolean; // Flag for hands-on, skills-focused paths
}

export interface GradingScaleEntry {
  grade: string; // 'A', 'B', 'C', 'D', 'E', 'O', 'F'
  minScore: number; // e.g., 80
  label: string; // 'Distinction', 'Credit', etc.
}

export interface GradingWeights {
  continuousAssessment: number; // e.g., 20
  endOfTerm: number; // e.g., 80
}

export interface SchoolConfig {
  id: string; // 'nabisunsa_girls'
  name: string;
  motto: string;
  logoUrl?: string;
  isActive: boolean; // Managed by Developer/System Owner
  disabledReason?: string;
  currentTermId: string;
  gradingSystem: {
    weights: GradingWeights;
    scale: GradingScaleEntry[];
  };
  streams?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Marks {
  id?: string; // Hashed: studentId_termId_subjectId
  studentId: string;
  subjectId: string;
  termId: string;
  classId: string;
  beginningOfTerm?: number; // BOT (0 - 100)
  midTerm?: number;         // Mid (0 - 100)
  endOfTerm?: number;        // EOT (0 - 100)
  continuousAssessment?: number; // Coursework e.g., assignments/projects/quizzes average (0 - 100)
  finalWeightScore?: number;     // Calculated: (CA * 0.2) + (EOT * 0.8)
  finalGrade?: string;           // E.g., 'A', 'B', 'C', 'D', 'E', 'O', 'F'
  remarks?: string;
  recordedBy: string; // Teacher/Admin UID
  updatedAt: Timestamp;
}

export interface Assignment {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  termId: string;
  title: string;
  description: string;
  dueDate: Timestamp;
  type: 'exercise' | 'activity' | 'exam';
  maxMarks: number; // e.g., 100
  createdAt: Timestamp;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  fileUrl: string; // Path in Firebase Storage
  fileName: string;
  status: 'submitted' | 'graded';
  grade?: number; // Score obtained
  feedback?: string;
  gradedBy?: string; // Teacher UID
  submittedAt: Timestamp;
}

export interface LessonComment {
  id: string;
  userId: string;
  displayName: string;
  userRole: UserRole;
  text: string;
  createdAt: Timestamp;
}

export interface Lesson {
  id: string;
  teacherId: string;
  subjectId: string;
  classId: string;
  termId: string;
  topic: string; // e.g., 'Force and Motion'
  title: string;
  googleDriveId: string; // File ID for video streaming
  pdfAttachmentUrl?: string; // PDF link in Storage
  imageAttachmentUrl?: string; // Image link in Storage
  commentCount: number;
  createdAt: Timestamp;
}

export interface Chat {
  id: string;
  participants: string[]; // List of user UIDs
  lastMessage?: string;
  lastSenderId?: string;
  unreadCounts: Record<string, number>; // UID -> count
  updatedAt: Timestamp;
}

export interface MessageAttachment {
  url: string;
  type: 'image/png' | 'image/jpeg' | 'application/pdf' | 'audio/m4a' | 'audio/mp4';
  name: string;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  attachments?: MessageAttachment[];
  createdAt: Timestamp;
}

export interface Notification {
  id: string;
  userId: string; // Target user UID
  title: string;
  body: string;
  type: 'assignment' | 'grade' | 'announcement' | 'chat' | 'project';
  referenceId: string; // Hashed or ID of target item
  isRead: boolean;
  createdAt: Timestamp;
}
