import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Image, useColorScheme, Platform, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { auth, db, isMockMode } from '../../services/firebase';
import { mockAuth } from '../../services/mockAuth';
import { getUserProfile } from '../../services/db/users';
import { getStudentMarksForTerm } from '../../services/db/marks';
import { getCourses } from '../../services/db/courses';
import { getRecommendations, RecommendationResult } from '../../services/careerAdvisor';
import { User, Marks, Course } from '../../types';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { notifyNewAnnouncements, getNotifiedAnnouncementIds } from '../../services/notifications';

const scienceChampImg = require('../../../assets/images/champions/science_champ.png');
const artsChampImg = require('../../../assets/images/champions/arts_champ.png');

const getChampionImage = (student: Champion) => {
  if (student.level === 'A-Level') {
    return student.track === 'Sciences' ? scienceChampImg : artsChampImg;
  }
  // For O-Level, alternate based on name
  return student.name.includes('Aisha') || student.name.includes('Lunkuse') || student.name.includes('Fatumah') || student.name.includes('Maria') ? artsChampImg : scienceChampImg;
};

const MOCK_ANNOUNCEMENTS = [
  {
    id: 'ann_1',
    title: '📢 Term 1 JAB Forecast and Career Guidance Week',
    body: 'The Academic Registrar is pleased to announce the commencement of the Career Advisory Week. Parents and students are encouraged to engage with our AI Counselor to plan university combinations.',
    date: 'May 24, 2026',
    isPinned: true
  },
  {
    id: 'ann_2',
    title: '📝 Beginning of Term (BOT) Marks Published',
    body: 'Continuous assessment BOT marks for all classes (S1-S6) have been uploaded by teachers. Parents can review weighted aggregates (20% coursework / 80% exams) directly on their transcripts.',
    date: 'May 22, 2026',
    isPinned: false
  },
  {
    id: 'ann_3',
    title: '🕌 Islamic Religious Education & Quran Recitation Gala',
    body: 'Nabisunsa Girls\' will host the Inter-School Quran Recitation Competition on Saturday, 6th June 2026. All parents are warmly welcome to attend and support our students.',
    date: 'May 18, 2026',
    isPinned: false
  }
];

export interface Champion {
  name: string;
  classId: string;
  stream: string;
  level: 'A-Level' | 'O-Level';
  track?: 'Sciences' | 'Arts';
  combination?: string;
  score: string;
  average: number;
  avatarSeed: string;
  achievements: string[];
  grades: { subject: string; grade: string }[];
  teacherPraise: string;
}

export const ACADEMIC_CHAMPIONS_DATABASE: Record<string, { termName: string; aLevel: Champion[]; oLevel: Champion[] }> = {
  '2026_t1': {
    termName: 'Term 1, 2026 (Active)',
    aLevel: [
      {
        name: 'Nakato Sarah',
        classId: 'Senior 6',
        stream: 'Red',
        level: 'A-Level',
        track: 'Sciences',
        combination: 'PCM',
        score: '20 Points',
        average: 96.8,
        avatarSeed: 'sarah',
        achievements: ['🏆 Class Valedictorian', '🔬 Science Star'],
        grades: [
          { subject: 'Principal Physics', grade: 'A' },
          { subject: 'Principal Chemistry', grade: 'A' },
          { subject: 'Principal Mathematics', grade: 'A' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary ICT', grade: 'D1' }
        ],
        teacherPraise: "Sarah's focus in advanced mathematics and physics is highly commendable. She possesses a rare analytical mind and maintains impeccable classroom discipline. She is an outstanding role model for the younger girls."
      },
      {
        name: 'Kembabazi Joanita',
        classId: 'Senior 6',
        stream: 'Blue',
        level: 'A-Level',
        track: 'Arts',
        combination: 'HEG',
        score: '19 Points',
        average: 94.2,
        avatarSeed: 'joanita',
        achievements: ['🏆 Top Humanist', '🗣️ Debating Champion'],
        grades: [
          { subject: 'Principal History', grade: 'A' },
          { subject: 'Principal Economics', grade: 'A' },
          { subject: 'Principal Geography', grade: 'B' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary Mathematics', grade: 'C3' }
        ],
        teacherPraise: "Joanita is a stellar humanities student. Her essay logic and command of geopolitical history is state-of-the-art. She led the Nabisunsa debate club to national championships this term."
      },
      {
        name: 'Babirye Florence',
        classId: 'Senior 5',
        stream: 'Red',
        level: 'A-Level',
        track: 'Sciences',
        combination: 'PCB',
        score: '19 Points',
        average: 93.5,
        avatarSeed: 'florence',
        achievements: ['⭐ Biology Pioneer', '🥇 High Honors'],
        grades: [
          { subject: 'Principal Physics', grade: 'A' },
          { subject: 'Principal Chemistry', grade: 'B' },
          { subject: 'Principal Biology', grade: 'A' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary ICT', grade: 'D1' }
        ],
        teacherPraise: "Florence has shown immense brilliance in medical science preparations. Her practical laboratory reports are consistently perfect. She is highly focused on a career in cardiac surgery."
      },
      {
        name: 'Nalwanga Shakirah',
        classId: 'Senior 5',
        stream: 'Green',
        level: 'A-Level',
        track: 'Arts',
        combination: 'DEG',
        score: '18 Points',
        average: 91.8,
        avatarSeed: 'shakirah',
        achievements: ['⭐ Divinity Scholar', '📚 Elite Academic'],
        grades: [
          { subject: 'Principal Divinity', grade: 'A' },
          { subject: 'Principal Economics', grade: 'B' },
          { subject: 'Principal Geography', grade: 'B' },
          { subject: 'General Paper', grade: 'D2' },
          { subject: 'Subsidiary Mathematics', grade: 'C4' }
        ],
        teacherPraise: "Shakirah exhibits outstanding dedication to both divinity research and macroeconomics. Her regular essays are highly thought-provoking, showcasing great intellectual maturity."
      }
    ],
    oLevel: [
      {
        name: 'Namubiru Mariam',
        classId: 'Senior 4',
        stream: 'Red',
        level: 'O-Level',
        score: '8 Aggregates',
        average: 96.0,
        avatarSeed: 'mariam',
        achievements: ['🏆 Distinction 1 Sweep', '💡 Innovator Award'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D1' },
          { subject: 'Chemistry', grade: 'D1' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'Geography', grade: 'D1' },
          { subject: 'History', grade: 'D1' },
          { subject: 'Islamic Religious Ed.', grade: 'D1' }
        ],
        teacherPraise: "Mariam has achieved a perfect pre-UNEB mock score of 8 aggregates. She remains a humble, industrious student who assists her peers in chemistry study circles."
      },
      {
        name: 'Aisha Namukasa',
        classId: 'Senior 3',
        stream: 'Blue',
        level: 'O-Level',
        score: '10 Aggregates',
        average: 93.8,
        avatarSeed: 'aisha',
        achievements: ['⭐ Elite Scholar', '🧬 Physics Star'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D1' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'French', grade: 'D1' },
          { subject: 'History', grade: 'D2' },
          { subject: 'Computer Studies', grade: 'D1' }
        ],
        teacherPraise: "Aisha is a very focused learner. Her logical capabilities in mathematics and computer science are remarkable, and she is always eager to explore beyond the national syllabus."
      },
      {
        name: 'Nabaasa Brenda',
        classId: 'Senior 2',
        stream: 'Red',
        level: 'O-Level',
        score: '11 Aggregates',
        average: 92.0,
        avatarSeed: 'brenda',
        achievements: ['⭐ High Achiever', '🍳 Culinary Artist'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D2' },
          { subject: 'Physics', grade: 'D1' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'Foods & Nutrition', grade: 'D1' },
          { subject: 'Geography', grade: 'D2' },
          { subject: 'Entrepreneurship', grade: 'D1' }
        ],
        teacherPraise: "Brenda represents the absolute spirit of Nabisunsa. Alongside her outstanding grades in sciences, she is extremely creative in culinary arts and entrepreneurship assignments."
      },
      {
        name: 'Lunkuse Shamilah',
        classId: 'Senior 1',
        stream: 'Green',
        level: 'O-Level',
        score: '12 Aggregates',
        average: 90.5,
        avatarSeed: 'shamilah',
        achievements: ['🌟 Rising Star', '🕌 Quran Gala Winner'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D2' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D2' },
          { subject: 'Islamic Religious Ed.', grade: 'D1' },
          { subject: 'Geography', grade: 'D2' },
          { subject: 'ICT studies', grade: 'D1' }
        ],
        teacherPraise: "Shamilah is a gifted freshman. She successfully balanced her academic transitions with securing first place in the school's internal Quran Recitation Competition."
      }
    ]
  },
  '2025_t3': {
    termName: 'Term 3, 2025',
    aLevel: [
      {
        name: 'Nalukwago Maria',
        classId: 'Senior 6',
        stream: 'Red',
        level: 'A-Level',
        track: 'Sciences',
        combination: 'BCM',
        score: '19 Points',
        average: 94.8,
        avatarSeed: 'maria',
        achievements: ['🥇 Top Biologist', '🔬 Lab Excellence'],
        grades: [
          { subject: 'Principal Biology', grade: 'A' },
          { subject: 'Principal Chemistry', grade: 'A' },
          { subject: 'Principal Mathematics', grade: 'B' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary ICT', grade: 'D1' }
        ],
        teacherPraise: "Maria's performance in biological theories is exemplary. She leads discussions in biology workshops and has solid aspirations for clinical research."
      },
      {
        name: 'Abbo Rebecca',
        classId: 'Senior 6',
        stream: 'Green',
        level: 'A-Level',
        track: 'Arts',
        combination: 'HEL',
        score: '20 Points',
        average: 97.0,
        avatarSeed: 'rebecca',
        achievements: ['🏆 Principal Trophy', '📚 Literature Star'],
        grades: [
          { subject: 'Principal History', grade: 'A' },
          { subject: 'Principal Economics', grade: 'A' },
          { subject: 'Principal Literature', grade: 'A' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary Mathematics', grade: 'C3' }
        ],
        teacherPraise: "Rebecca achieved the rare perfect score of 20 points in humanities. Her literature analyses are of university standard. A highly analytical and creative mind."
      },
      {
        name: 'Nakawungu Fatumah',
        classId: 'Senior 5',
        stream: 'Blue',
        level: 'A-Level',
        track: 'Sciences',
        combination: 'PEM',
        score: '18 Points',
        average: 91.5,
        avatarSeed: 'fatumah',
        achievements: ['⭐ Economics Champ', '🥇 High Honors'],
        grades: [
          { subject: 'Principal Physics', grade: 'B' },
          { subject: 'Principal Economics', grade: 'A' },
          { subject: 'Principal Mathematics', grade: 'B' },
          { subject: 'General Paper', grade: 'D2' },
          { subject: 'Subsidiary ICT', grade: 'D1' }
        ],
        teacherPraise: "Fatumah bridges math and economics beautifully. She displays brilliant business acumen and analytical focus in mathematical modeling."
      },
      {
        name: 'Kiconco Peace',
        classId: 'Senior 5',
        stream: 'Red',
        level: 'A-Level',
        track: 'Arts',
        combination: 'HEG',
        score: '18 Points',
        average: 90.8,
        avatarSeed: 'peace',
        achievements: ['⭐ Top Scholar', '🌍 Geography Star'],
        grades: [
          { subject: 'Principal History', grade: 'A' },
          { subject: 'Principal Economics', grade: 'B' },
          { subject: 'Principal Geography', grade: 'B' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary Mathematics', grade: 'C4' }
        ],
        teacherPraise: "Peace is a wonderful asset in discussions. Her understanding of agricultural geography and socioeconomic history is excellent."
      }
    ],
    oLevel: [
      {
        name: 'Aisha Namukasa',
        classId: 'Senior 4',
        stream: 'Blue',
        level: 'O-Level',
        score: '9 Aggregates',
        average: 95.2,
        avatarSeed: 'aisha',
        achievements: ['🏆 Academic Cup', '🧬 Physics Star'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D1' },
          { subject: 'Chemistry', grade: 'D1' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'French', grade: 'D1' },
          { subject: 'History', grade: 'D2' },
          { subject: 'Computer Studies', grade: 'D1' }
        ],
        teacherPraise: "Aisha is a very focused learner. Her logical capabilities in mathematics and computer science are remarkable."
      },
      {
        name: 'Nabaasa Brenda',
        classId: 'Senior 3',
        stream: 'Red',
        level: 'O-Level',
        score: '11 Aggregates',
        average: 92.5,
        avatarSeed: 'brenda',
        achievements: ['⭐ Elite Scholar', '🥇 Culinary Artist'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D2' },
          { subject: 'Physics', grade: 'D1' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'Foods & Nutrition', grade: 'D1' },
          { subject: 'Geography', grade: 'D2' },
          { subject: 'Entrepreneurship', grade: 'D1' }
        ],
        teacherPraise: "Brenda represents the absolute spirit of Nabisunsa. Her practicals are exemplary."
      },
      {
        name: 'Lunkuse Shamilah',
        classId: 'Senior 2',
        stream: 'Green',
        level: 'O-Level',
        score: '12 Aggregates',
        average: 90.8,
        avatarSeed: 'shamilah',
        achievements: ['⭐ High Achiever', '🌟 Rising Star'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D2' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D2' },
          { subject: 'Islamic Religious Ed.', grade: 'D1' },
          { subject: 'Geography', grade: 'D2' },
          { subject: 'ICT studies', grade: 'D1' }
        ],
        teacherPraise: "Shamilah is a gifted freshman. She displays excellent discipline."
      },
      {
        name: 'Katusiime Daphne',
        classId: 'Senior 1',
        stream: 'Blue',
        level: 'O-Level',
        score: '13 Aggregates',
        average: 89.2,
        avatarSeed: 'daphne',
        achievements: ['🌟 Top Freshman', '📚 Literature Star'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D2' },
          { subject: 'Physics', grade: 'D2' },
          { subject: 'Chemistry', grade: 'D3' },
          { subject: 'Biology', grade: 'D2' },
          { subject: 'Literature in English', grade: 'D1' },
          { subject: 'History', grade: 'D2' },
          { subject: 'Geography', grade: 'D2' }
        ],
        teacherPraise: "Daphne has made an exceptional transition into high school. She maintains a brilliant work ethic in english literature."
      }
    ]
  },
  '2025_t2': {
    termName: 'Term 2, 2025',
    aLevel: [
      {
        name: 'Nakato Sarah',
        classId: 'Senior 6',
        stream: 'Red',
        level: 'A-Level',
        track: 'Sciences',
        combination: 'PCM',
        score: '19 Points',
        average: 95.5,
        avatarSeed: 'sarah',
        achievements: ['🥇 Science Star', '🔬 Math Champion'],
        grades: [
          { subject: 'Principal Physics', grade: 'A' },
          { subject: 'Principal Chemistry', grade: 'B' },
          { subject: 'Principal Mathematics', grade: 'A' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary ICT', grade: 'D1' }
        ],
        teacherPraise: "Sarah is an exceptionally analytical pupil, leading in advanced mathematics tutorials."
      },
      {
        name: 'Kembabazi Joanita',
        classId: 'Senior 6',
        stream: 'Blue',
        level: 'A-Level',
        track: 'Arts',
        combination: 'HEG',
        score: '18 Points',
        average: 93.0,
        avatarSeed: 'joanita',
        achievements: ['🥇 Top Humanist', '🗣️ Speaker Award'],
        grades: [
          { subject: 'Principal History', grade: 'A' },
          { subject: 'Principal Economics', grade: 'B' },
          { subject: 'Principal Geography', grade: 'B' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary Mathematics', grade: 'C3' }
        ],
        teacherPraise: "Joanita remains a passionate intellectual with highly polished analytical writing."
      },
      {
        name: 'Babirye Florence',
        classId: 'Senior 5',
        stream: 'Red',
        level: 'A-Level',
        track: 'Sciences',
        combination: 'PCB',
        score: '18 Points',
        average: 92.0,
        avatarSeed: 'florence',
        achievements: ['⭐ Medical Aspirant', '🥇 High Honors'],
        grades: [
          { subject: 'Principal Physics', grade: 'B' },
          { subject: 'Principal Chemistry', grade: 'A' },
          { subject: 'Principal Biology', grade: 'B' },
          { subject: 'General Paper', grade: 'D1' },
          { subject: 'Subsidiary ICT', grade: 'D1' }
        ],
        teacherPraise: "Florence shows amazing dedication in lab experiments and organic chemistry lectures."
      },
      {
        name: 'Nalwanga Shakirah',
        classId: 'Senior 5',
        stream: 'Green',
        level: 'A-Level',
        track: 'Arts',
        combination: 'DEG',
        score: '17 Points',
        average: 90.0,
        avatarSeed: 'shakirah',
        achievements: ['⭐ Divinity Scholar', '📚 High Honors'],
        grades: [
          { subject: 'Principal Divinity', grade: 'B' },
          { subject: 'Principal Economics', grade: 'B' },
          { subject: 'Principal Geography', grade: 'B' },
          { subject: 'General Paper', grade: 'D2' },
          { subject: 'Subsidiary Mathematics', grade: 'C4' }
        ],
        teacherPraise: "Shakirah exhibits high academic integrity and has consistently perfect scripture studies."
      }
    ],
    oLevel: [
      {
        name: 'Namubiru Mariam',
        classId: 'Senior 4',
        stream: 'Red',
        level: 'O-Level',
        score: '9 Aggregates',
        average: 94.8,
        avatarSeed: 'mariam',
        achievements: ['🏆 Star Scholar', '💡 Math Genius'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D1' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'Geography', grade: 'D1' },
          { subject: 'History', grade: 'D2' },
          { subject: 'Islamic Religious Ed.', grade: 'D1' }
        ],
        teacherPraise: "Mariam has achieved outstanding science and mathematical aggregates. She is a natural leader."
      },
      {
        name: 'Aisha Namukasa',
        classId: 'Senior 3',
        stream: 'Blue',
        level: 'O-Level',
        score: '11 Aggregates',
        average: 92.5,
        avatarSeed: 'aisha',
        achievements: ['⭐ Elite Scholar', '🧬 Physics Star'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D1' },
          { subject: 'Physics', grade: 'D2' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'French', grade: 'D2' },
          { subject: 'History', grade: 'D2' },
          { subject: 'Computer Studies', grade: 'D1' }
        ],
        teacherPraise: "Aisha is a very focused learner with tremendous academic drive."
      },
      {
        name: 'Nabaasa Brenda',
        classId: 'Senior 2',
        stream: 'Red',
        level: 'O-Level',
        score: '12 Aggregates',
        average: 90.8,
        avatarSeed: 'brenda',
        achievements: ['⭐ High Achiever', '🥇 Culinary Artist'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D2' },
          { subject: 'Physics', grade: 'D2' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D1' },
          { subject: 'Foods & Nutrition', grade: 'D1' },
          { subject: 'Geography', grade: 'D3' },
          { subject: 'Entrepreneurship', grade: 'D2' }
        ],
        teacherPraise: "Brenda maintains stellar discipline and works exceptionally hard."
      },
      {
        name: 'Lunkuse Shamilah',
        classId: 'Senior 1',
        stream: 'Green',
        level: 'O-Level',
        score: '13 Aggregates',
        average: 88.5,
        avatarSeed: 'shamilah',
        achievements: ['🌟 Rising Star', '🕌 Quran Gala Winner'],
        grades: [
          { subject: 'English Language', grade: 'D1' },
          { subject: 'Mathematics', grade: 'D2' },
          { subject: 'Physics', grade: 'D3' },
          { subject: 'Chemistry', grade: 'D2' },
          { subject: 'Biology', grade: 'D3' },
          { subject: 'Islamic Religious Ed.', grade: 'D1' },
          { subject: 'Geography', grade: 'D2' },
          { subject: 'ICT studies', grade: 'D1' }
        ],
        teacherPraise: "Shamilah is a gifted freshman with perfect scores in religious studies."
      }
    ]
  }
};


export default function BillboardDashboard() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [topMatch, setTopMatch] = useState<RecommendationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [termAverage, setTermAverage] = useState(0);
  const [activeLeaderboardTab, setActiveLeaderboardTab] = useState<'alevel' | 'olevel'>('alevel');

  // Interactive Term and Champion details state
  const [selectedTerm, setSelectedTerm] = useState<string>('2026_t1');
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [championModalVisible, setChampionModalVisible] = useState<boolean>(false);
  const [readAnnouncementIds, setReadAnnouncementIds] = useState<Set<string>>(new Set());

  // Fetch student profile, marks, and run the recommendation engine
  useEffect(() => {
    async function loadDashboardData() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        // 1. Fetch User Profile
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);

        if (profile) {
          // 2. Fetch Marks for Current Term
          const termId = '2026_term1'; // Standard seeded term
          const studentMarks = await getStudentMarksForTerm(currentUser.uid, termId);
          setMarks(studentMarks);

          // Calculate Academic Average
          if (studentMarks.length > 0) {
            const sum = studentMarks.reduce((acc, curr) => acc + (curr.finalWeightScore || 0), 0);
            setTermAverage(parseFloat((sum / studentMarks.length).toFixed(1)));
          }

          // 3. Fetch Course Database and Run JAB Advisor Math
          const coursesList = await getCourses();

          // Prepare UACE Marks structure if A-Level student
          if (profile.level === 'A-Level' && studentMarks.length >= 3) {
            // Map student principal grades
            const subjectsMap = studentMarks.reduce((acc, curr) => {
              acc[curr.subjectId] = curr.finalGrade || 'F';
              return acc;
            }, {} as Record<string, string>);

            // Construct standard UaceMarks inputs
            const uaceGrades = {
              subject1: { id: (profile.subjects || [])[0] || 'a_mathematics', grade: (subjectsMap[(profile.subjects || [])[0]] || 'A') as any },
              subject2: { id: (profile.subjects || [])[1] || 'a_physics', grade: (subjectsMap[(profile.subjects || [])[1]] || 'B') as any },
              subject3: { id: (profile.subjects || [])[2] || 'a_chemistry', grade: (subjectsMap[(profile.subjects || [])[2]] || 'C') as any },
              generalPaperPassed: true, // Mocked for simplicity
              subsidiaryPassed: true
            };

            // Map O-Level grades from profile uceGrades mapping
            const uceGradesList = Object.entries(profile.uceGrades || {}).map(([subId, gr]) => ({
              subjectId: subId,
              subjectName: subId.replace('o_', '').toUpperCase(),
              grade: gr
            }));

            // Execute matching math
            const matches = getRecommendations(uceGradesList, uaceGrades, coursesList);
            // Get the best high/medium recommendation
            const validMatches = matches.filter(m => m.eligibility !== 'Ineligible');
            if (validMatches.length > 0) {
              setTopMatch(validMatches[0]);
            }
          } else if (profile.level === 'O-Level') {
            // If O-Level, recommend a vocational course that matches hands-on skills
            const vocationalCourses = coursesList.filter(c => c.isVocational);
            if (vocationalCourses.length > 0) {
              setTopMatch({
                course: vocationalCourses[0],
                totalWeight: 0,
                eligibility: 'High',
                confidenceScore: 95,
                reason: 'O-Level vocational vacation tracks are highly recommended to cultivate specialized practical crafts!',
                breakdown: []
              });
            }
          }
        }
      } catch (error) {
        console.error('Error loading dashboard statistics:', error);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // Fire OS push notifications for any unseen announcements
  useEffect(() => {
    async function fireNotifications() {
      // Send real phone notifications for new announcements
      await notifyNewAnnouncements(MOCK_ANNOUNCEMENTS);
      // Load which ones have already been notified (for read/unread badge display)
      const notified = await getNotifiedAnnouncementIds();
      setReadAnnouncementIds(notified);
    }
    fireNotifications();
  }, []);

  const handleLogout = async () => {
    try {
      if (isMockMode) {
        await mockAuth.signOut();
      } else {
        await signOut(auth);
      }
      router.replace('/');
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  const renderTeacherDashboard = () => {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

        {/* Corporate Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>Welcome Back,</Text>
            <Text style={[styles.studentName, { color: colors.text }]}>{userProfile?.displayName}</Text>
            <Text style={[styles.classTag, { color: colors.gold }]}>
              Academic Faculty • Physics & Math Tutor
            </Text>
          </View>
          <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.gold, backgroundColor: colors.gold + '15' }]} onPress={handleLogout}>
            <FontAwesome5 name="sign-out-alt" size={13} color={colors.gold} />
            <Text style={[styles.logoutBtnText, { color: colors.gold }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Teacher Info Card */}
        <View style={[styles.billboardFrame, { borderColor: colors.gold, backgroundColor: colors.backgroundElement }]}>
          <View style={[styles.billboardRibbon, { backgroundColor: colors.primary }]}>
            <FontAwesome5 name="chalkboard-teacher" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.ribbonText}>TEACHER CONSOLE COMMAND HUB</Text>
          </View>
          <View style={styles.billboardContent}>
            <Text style={[styles.courseTitle, { color: colors.text, fontSize: 16 }]}>
              Nabisunsa Girls' Secondary School Faculty
            </Text>
            <Text style={[styles.billboardReasoning, { color: colors.textSecondary, marginBottom: 0 }]}>
              As an authorized academic instructor, you have administrative permission to upload coursework marks, record final exam results, and post e-learning video notes. All weights are strictly compiled to the Ugandan National Syllabus.
            </Text>
          </View>
        </View>

        {/* Assigned Subjects & Roster Info */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Your Active Teaching Classes</Text>
        <View style={{ marginBottom: Spacing.four }}>
          <View style={[styles.classItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
            <View style={styles.classIconBg}>
              <FontAwesome5 name="book-open" size={14} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>S5 Red Stream</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Principal Physics • A-Level</Text>
            </View>
            <TouchableOpacity 
              style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/admin/marks-entry')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Enter Marks</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.classItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold, marginTop: 10 }]}>
            <View style={styles.classIconBg}>
              <FontAwesome5 name="calculator" size={14} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>S5 Red Stream</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Principal Mathematics • A-Level</Text>
            </View>
            <TouchableOpacity 
              style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/admin/marks-entry')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Enter Marks</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.classItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold, marginTop: 10 }]}>
            <View style={styles.classIconBg}>
              <FontAwesome5 name="atom" size={14} color={colors.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '800', color: colors.text, fontSize: 14 }}>S3 Blue Stream</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>Syllabus Physics • O-Level</Text>
            </View>
            <TouchableOpacity 
              style={[styles.smallActionBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/admin/marks-entry')}
            >
              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>Enter Marks</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Primary Command Grid */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Teacher Utilities</Text>
        <View style={styles.gridContainer}>
          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/marks-entry')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="edit" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Bulk Marks Entry</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Enter Class Grades</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/post-assignment')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="file-upload" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Post Coursework</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Upload Assignments</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/post-lesson')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="cloud-upload-alt" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Publish Lesson</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Upload Video & Notes</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/(tabs)/classroom')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="video" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Video Library</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Manage Classroom</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/(tabs)/chat')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="comments" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Parent Chat Hub</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Roster Messages</Text>
          </TouchableOpacity>
        </View>

        {renderHallOfFameAndAnnouncements()}
        <View style={styles.academicFooter}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Nabisunsa Girls' Secondary School Faculty Portal
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderAdminDashboard = () => {
    return (
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

        {/* Corporate Header */}
        <View style={styles.header}>
          <View>
            <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>Welcome Back,</Text>
            <Text style={[styles.studentName, { color: colors.text }]}>{userProfile?.displayName}</Text>
            <Text style={[styles.classTag, { color: colors.gold }]}>
              School Administration Portal • {userProfile?.role === 'system_owner' ? 'Super Developer' : 'Headmistress Panel'}
            </Text>
          </View>
          <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.gold, backgroundColor: colors.gold + '15' }]} onPress={handleLogout}>
            <FontAwesome5 name="sign-out-alt" size={13} color={colors.gold} />
            <Text style={[styles.logoutBtnText, { color: colors.gold }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Admin School Security Status Block */}
        <View style={[styles.billboardFrame, { borderColor: colors.gold, backgroundColor: colors.backgroundElement }]}>
          <View style={[styles.billboardRibbon, { backgroundColor: colors.primary }]}>
            <FontAwesome5 name="shield-alt" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.ribbonText}>SCHOOL OPERATIONAL STATUS INDICATOR</Text>
          </View>
          <View style={styles.billboardContent}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two }}>
              <Text style={{ fontWeight: '800', fontSize: 16, color: colors.text }}>Nabisunsa Girls App Shield</Text>
              <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: colors.success + '1A', borderWidth: 1, borderColor: colors.success }}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.success }}>OPERATIONAL</Text>
              </View>
            </View>
            <Text style={[styles.billboardReasoning, { color: colors.textSecondary }]}>
              The digital school information infrastructure is currently active. Students and parents are granted full access to view continuous assessment grades, JAB university path matches, and e-learning resources.
            </Text>
            <TouchableOpacity 
              style={[styles.billboardBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/developer')}
            >
              <Text style={styles.billboardBtnText}>Manage System Status & App Locks</Text>
              <FontAwesome5 name="chevron-right" size={11} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Administrative Quick Roster Numbers */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>School Registry Analytics</Text>
        <View style={styles.gradesRow}>
          <View style={[styles.gradeCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
            <FontAwesome5 name="user-graduate" size={24} color={colors.gold} style={{ marginBottom: 6 }} />
            <Text style={[styles.averageVal, { color: colors.text }]}>120</Text>
            <Text style={[styles.averageLbl, { color: colors.text, fontSize: 11 }]}>Students Registered</Text>
          </View>
          <View style={[styles.gradeCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
            <FontAwesome5 name="users" size={24} color={colors.gold} style={{ marginBottom: 6 }} />
            <Text style={[styles.averageVal, { color: colors.text }]}>18</Text>
            <Text style={[styles.averageLbl, { color: colors.text, fontSize: 11 }]}>Faculty Members</Text>
          </View>
          <View style={[styles.gradeCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
            <FontAwesome5 name="scroll" size={24} color={colors.gold} style={{ marginBottom: 6 }} />
            <Text style={[styles.averageVal, { color: colors.text }]}>50+</Text>
            <Text style={[styles.averageLbl, { color: colors.text, fontSize: 11 }]}>Cutoff Courses</Text>
          </View>
        </View>

        {/* Administrative Utilities Command Grid */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Administrative Utilities</Text>
        <View style={styles.gridContainer}>
          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/developer')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="cogs" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Developer Panel</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Configure locks & offline</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/register-student' as any)}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="user-plus" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Register Student</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Add profile & portrait</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/marks-entry')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="clipboard-list" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Roster Auditor</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Review teacher score sheets</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/(tabs)/classroom')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="folder-open" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Course Syllabus</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Manage academic models</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/(tabs)/chat')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="broadcast-tower" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Communication Hub</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Chat logs & broadcasts</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/post-assignment')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="edit" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Post Coursework</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Publish class assignments</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/admin/post-lesson')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="cloud-upload-alt" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Publish Lesson</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Upload Video & Notes</Text>
          </TouchableOpacity>
        </View>

        {renderHallOfFameAndAnnouncements()}
        <View style={styles.academicFooter}>
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Nabisunsa Girls' Secondary School Administrator Console
          </Text>
        </View>
      </ScrollView>
    );
  };

  const renderHallOfFameAndAnnouncements = () => {
    const currentTermData = ACADEMIC_CHAMPIONS_DATABASE[selectedTerm] || ACADEMIC_CHAMPIONS_DATABASE['2026_t1'];

    return (
      <View style={{ marginTop: Spacing.four }}>
        
        {/* 1. Prestigious Announcements Bulletin (Notice Board) */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>📢 Official School Announcements</Text>
        <View style={{ marginBottom: Spacing.four }}>
          {MOCK_ANNOUNCEMENTS.map((ann) => {
            const isUnread = !readAnnouncementIds.has(ann.id);
            return (
            <TouchableOpacity 
              key={ann.id}
              activeOpacity={0.85}
              onPress={() => {
                // Mark as read when tapped
                setReadAnnouncementIds(prev => {
                  const updated = new Set(prev);
                  updated.add(ann.id);
                  return updated;
                });
              }}
              style={[
                styles.announcementCard, 
                { 
                  backgroundColor: colors.backgroundElement, 
                  borderColor: ann.isPinned ? colors.gold : colors.gold + '20',
                  borderLeftWidth: ann.isPinned ? 3 : 1
                }
              ]}
            >
              <View style={styles.annHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.annTitle, { color: colors.text, fontWeight: ann.isPinned ? '800' : '700' }]}>
                    {ann.title}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {isUnread && (
                    <View style={[styles.unreadBadge, { backgroundColor: colors.primary }]}>
                      <Text style={{ fontSize: 8, color: '#FFFFFF', fontWeight: '800' }}>NEW</Text>
                    </View>
                  )}
                  {ann.isPinned && (
                    <View style={[styles.pinnedBadge, { backgroundColor: colors.gold + '1A' }]}>
                      <Text style={{ fontSize: 8, color: colors.gold, fontWeight: '800', textTransform: 'uppercase' }}>Pinned</Text>
                    </View>
                  )}
                </View>
              </View>
              <Text style={[styles.annBody, { color: colors.textSecondary }]}>{ann.body}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 9, color: colors.gold, fontWeight: '600' }}>Date Published: {ann.date}</Text>
                {isUnread && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                    <Text style={{ fontSize: 9, color: colors.primary, fontWeight: '700' }}>Unread</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          );
          })}
        </View>

        {/* 2. Interactive Term Selector Pill-Row */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.two }]}>🏆 Termly Academic Excellence Notifications</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.termSelectorScroll}
          contentContainerStyle={{ gap: Spacing.two, paddingBottom: Spacing.two }}
        >
          {Object.entries(ACADEMIC_CHAMPIONS_DATABASE).map(([key, data]) => {
            const isActive = selectedTerm === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setSelectedTerm(key)}
                style={[
                  styles.termPill,
                  { backgroundColor: colors.backgroundElement, borderColor: colors.gold + '30' },
                  isActive && [styles.activeTermPill, { borderColor: colors.gold, backgroundColor: colors.champagne }]
                ]}
              >
                <FontAwesome5 
                  name="calendar-alt" 
                  size={10} 
                  color={isActive ? colors.gold : colors.textSecondary} 
                  style={{ marginRight: 6 }} 
                />
                <Text 
                  style={[
                    styles.termPillText,
                    { color: colors.textSecondary },
                    isActive && [styles.activeTermPillText, { color: colors.gold }]
                  ]}
                >
                  {data.termName}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 3. Nabisunsa Academic Hall of Fame (Prestige Roll Leaderboard) */}
        <View style={[styles.hallOfFameContainer, { borderColor: colors.gold, backgroundColor: colors.backgroundElement }]}>
          <View style={[styles.billboardRibbon, { backgroundColor: colors.primary }]}>
            <FontAwesome5 name="crown" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.ribbonText}>NABISUNSA ACADEMIC HALL OF FAME ({currentTermData.termName.toUpperCase()})</Text>
          </View>

          {/* Tab selectors for A-Level vs O-Level */}
          <View style={[styles.tabBar, { borderBottomColor: colors.gold + '20' }]}>
            <TouchableOpacity 
              style={[styles.tabItem, activeLeaderboardTab === 'alevel' && { borderBottomColor: colors.gold }]}
              onPress={() => setActiveLeaderboardTab('alevel')}
            >
              <Text style={[styles.tabItemText, { color: activeLeaderboardTab === 'alevel' ? colors.gold : colors.textSecondary }]}>
                A-Level (Sciences & Arts)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabItem, activeLeaderboardTab === 'olevel' && { borderBottomColor: colors.gold }]}
              onPress={() => setActiveLeaderboardTab('olevel')}
            >
              <Text style={[styles.tabItemText, { color: activeLeaderboardTab === 'olevel' ? colors.gold : colors.textSecondary }]}>
                O-Level (S1 - S4)
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ padding: Spacing.three }}>
            {activeLeaderboardTab === 'alevel' ? (
              // Group A-Level by classId (Senior 6 and Senior 5)
              ['Senior 6', 'Senior 5'].map((classId) => {
                const champions = currentTermData.aLevel.filter(c => c.classId === classId);
                const scienceChamp = champions.find(c => c.track === 'Sciences');
                const artsChamp = champions.find(c => c.track === 'Arts');

                return (
                  <View key={classId} style={styles.classSectionCard}>
                    <Text style={[styles.classSectionHeader, { color: colors.primary }]}>
                      {classId} Academic Leaders
                    </Text>
                    
                    <View style={styles.championsFlexRow}>
                      {/* Science Champ column */}
                      {scienceChamp && (
                        <TouchableOpacity 
                          style={[styles.championHalfCard, { borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                          onPress={() => {
                            setSelectedChampion(scienceChamp);
                            setChampionModalVisible(true);
                          }}
                        >
                          <View style={[styles.trackBadge, styles.scienceTrack, { backgroundColor: colors.primary + '1A' }]}>
                            <FontAwesome5 name="atom" size={10} color={colors.primary} />
                            <Text style={[styles.trackBadgeText, { color: colors.primary }]}>Sciences</Text>
                          </View>

                          <Image 
                            source={getChampionImage(scienceChamp)} 
                            style={[styles.cardAvatar, { borderColor: colors.gold + '40', borderWidth: 1 }]}
                          />
                          
                          <Text style={[styles.championHalfName, { color: colors.text }]} numberOfLines={1}>
                            {scienceChamp.name}
                          </Text>
                          
                          <Text style={[styles.championHalfScore, { color: colors.gold }]}>
                            {scienceChamp.score}
                          </Text>
                          
                          <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                            Combination: {scienceChamp.combination}
                          </Text>
                          
                          <View style={styles.tapDetailsIndicator}>
                            <Text style={{ fontSize: 8, color: colors.gold, fontWeight: '700' }}>Tap for details</Text>
                            <FontAwesome5 name="chevron-right" size={6} color={colors.gold} style={{ marginLeft: 3 }} />
                          </View>
                        </TouchableOpacity>
                      )}

                      {/* Arts Champ column */}
                      {artsChamp && (
                        <TouchableOpacity 
                          style={[styles.championHalfCard, { borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                          onPress={() => {
                            setSelectedChampion(artsChamp);
                            setChampionModalVisible(true);
                          }}
                        >
                          <View style={[styles.trackBadge, styles.artsTrack, { backgroundColor: colors.gold + '1A' }]}>
                            <FontAwesome5 name="palette" size={10} color={colors.gold} />
                            <Text style={[styles.trackBadgeText, { color: colors.gold }]}>Arts</Text>
                          </View>

                          <Image 
                            source={getChampionImage(artsChamp)} 
                            style={[styles.cardAvatar, { borderColor: colors.gold + '40', borderWidth: 1 }]}
                          />
                          
                          <Text style={[styles.championHalfName, { color: colors.text }]} numberOfLines={1}>
                            {artsChamp.name}
                          </Text>
                          
                          <Text style={[styles.championHalfScore, { color: colors.gold }]}>
                            {artsChamp.score}
                          </Text>
                          
                          <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                            Combination: {artsChamp.combination}
                          </Text>
                          
                          <View style={styles.tapDetailsIndicator}>
                            <Text style={{ fontSize: 8, color: colors.gold, fontWeight: '700' }}>Tap for details</Text>
                            <FontAwesome5 name="chevron-right" size={6} color={colors.gold} style={{ marginLeft: 3 }} />
                          </View>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            ) : (
              // O-Level: List S4 down to S1
              currentTermData.oLevel.map((student, idx) => (
                <TouchableOpacity 
                  key={idx} 
                  style={[
                    styles.leaderboardRow, 
                    { backgroundColor: colors.background + '40', borderRadius: Spacing.one, paddingHorizontal: Spacing.two, marginBottom: Spacing.two },
                    idx < currentTermData.oLevel.length - 1 && { borderBottomColor: colors.gold + '1A' }
                  ]}
                  onPress={() => {
                    setSelectedChampion(student);
                    setChampionModalVisible(true);
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 6, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ position: 'relative', marginRight: Spacing.two }}>
                      <Image 
                        source={getChampionImage(student)} 
                        style={[styles.rowAvatar, { borderColor: colors.gold + '30', borderWidth: 1 }]}
                      />
                      <View style={[styles.rowClassBadge, { backgroundColor: colors.gold }]}>
                        <Text style={styles.rowClassBadgeText}>
                          {student.classId.replace('Senior ', 'S')}
                        </Text>
                      </View>
                    </View>
                    <View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                        <Text style={{ fontWeight: '800', color: colors.text, fontSize: 13 }}>{student.name}</Text>
                        {student.achievements && student.achievements.length > 0 && (
                          <View style={[styles.leaderboardBadge, { backgroundColor: colors.gold + '15' }]}>
                            <Text style={{ fontSize: 8, color: colors.gold, fontWeight: '700' }}>{student.achievements[0]}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 2 }}>
                        {student.classId} {student.stream} Stream Champion
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontWeight: '800', color: colors.primary, fontSize: 13 }}>{student.score}</Text>
                    <Text style={{ fontSize: 9, color: colors.textSecondary }}>{student.average}% Average</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>

        {/* 4. Interactive Certificate of Excellence Details Modal */}
        <Modal
          animationType="fade"
          transparent={true}
          visible={championModalVisible}
          onRequestClose={() => setChampionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
              {selectedChampion && (
                <View style={[styles.certificateFrame, { borderColor: colors.gold }]}>
                  {/* Decorative Borders */}
                  <View style={[styles.certRibbon, { backgroundColor: colors.primary }]}>
                    <FontAwesome5 name="award" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.certRibbonText}>NABISUNSA CERTIFICATE OF EXCELLENCE</Text>
                  </View>

                  <ScrollView contentContainerStyle={{ padding: Spacing.four, alignItems: 'center' }}>
                    
                    {/* Laurel Wreath Icon Container */}
                    <View style={[styles.certAvatarContainer, { borderColor: colors.gold }]}>
                      <Image 
                        source={getChampionImage(selectedChampion)} 
                        style={styles.certAvatar}
                      />
                      <View style={[styles.laurelWreathBadge, { backgroundColor: colors.gold }]}>
                        <FontAwesome5 name="crown" size={8} color="#FFFFFF" />
                      </View>
                    </View>

                    {/* Student Name */}
                    <Text style={[styles.certStudentName, { color: colors.text }]}>
                      {selectedChampion.name}
                    </Text>
                    <Text style={[styles.certSubtitle, { color: colors.gold }]}>
                      {selectedChampion.classId} {selectedChampion.stream} Stream • {selectedChampion.level}
                    </Text>

                    {/* Track info for A-Level */}
                    {selectedChampion.level === 'A-Level' && (
                      <View style={[styles.trackBadge, { backgroundColor: colors.champagne, borderColor: colors.gold, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 12, marginBottom: Spacing.three }]}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: colors.gold }}>
                          {selectedChampion.track?.toUpperCase()} TRACK • {selectedChampion.combination}
                        </Text>
                      </View>
                    )}

                    {/* Academic Performance Badges */}
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: Spacing.four }}>
                      {selectedChampion.achievements.map((ach, i) => (
                        <View key={i} style={[styles.pinnedBadge, { backgroundColor: colors.gold + '15', borderColor: colors.gold + '40', borderWidth: 0.5 }]}>
                          <Text style={{ fontSize: 9, color: colors.gold, fontWeight: '800' }}>{ach}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Metrics Grid */}
                    <View style={[styles.certStatsGrid, { borderColor: colors.gold + '20' }]}>
                      <View style={styles.certStatCard}>
                        <Text style={[styles.certStatVal, { color: colors.primary }]}>{selectedChampion.score}</Text>
                        <Text style={[styles.certStatLbl, { color: colors.textSecondary }]}>UNEB Score</Text>
                      </View>
                      <View style={[styles.verticalDivider, { backgroundColor: colors.gold + '40', height: 32 }]} />
                      <View style={styles.certStatCard}>
                        <Text style={[styles.certStatVal, { color: colors.success }]}>{selectedChampion.average}%</Text>
                        <Text style={[styles.certStatLbl, { color: colors.textSecondary }]}>Term Average</Text>
                      </View>
                    </View>

                    {/* Teacher Commendation Section */}
                    <View style={[styles.teacherPraiseBox, { backgroundColor: colors.champagne + '30', borderLeftColor: colors.gold }]}>
                      <FontAwesome5 name="quote-left" size={12} color={colors.gold} style={{ marginBottom: 4 }} />
                      <Text style={[styles.teacherPraiseText, { color: colors.text }]}>
                        "{selectedChampion.teacherPraise}"
                      </Text>
                      <Text style={{ alignSelf: 'flex-end', fontSize: 10, fontWeight: '700', color: colors.gold, marginTop: 6 }}>
                        — Nabisunsa Faculty Board Recommendation
                      </Text>
                    </View>

                    {/* Grade breakdown Transcript */}
                    <Text style={[styles.certTranscriptTitle, { color: colors.text }]}>
                      📝 Grade Transcript Breakdown
                    </Text>
                    <View style={[styles.certGradesList, { backgroundColor: colors.backgroundElement, borderColor: colors.gold + '20' }]}>
                      {selectedChampion.grades.map((gr, idx) => (
                        <View 
                          key={idx} 
                          style={[
                            styles.certGradeItem, 
                            idx < selectedChampion.grades.length - 1 && { borderBottomColor: colors.gold + '10', borderBottomWidth: 1 }
                          ]}
                        >
                          <Text style={[styles.certGradeSub, { color: colors.text }]}>{gr.subject}</Text>
                          <View style={[styles.certGradeVal, { backgroundColor: colors.primary }]}>
                            <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '800' }}>{gr.grade}</Text>
                          </View>
                        </View>
                      ))}
                    </View>

                  </ScrollView>

                  {/* Close button */}
                  <TouchableOpacity 
                    style={[styles.modalCloseBtn, { backgroundColor: colors.primary }]}
                    onPress={() => setChampionModalVisible(false)}
                  >
                    <Text style={styles.modalCloseBtnText}>Close Certificate</Text>
                  </TouchableOpacity>

                </View>
              )}
            </View>
          </View>
        </Modal>

      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if ((userProfile?.role as string) === 'teacher') {
    return renderTeacherDashboard();
  }

  if ((userProfile?.role as string) === 'admin' || (userProfile?.role as string) === 'system_owner') {
    return renderAdminDashboard();
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Corporate Dashboard Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.welcomeText, { color: colors.textSecondary }]}>Welcome Back,</Text>
          <Text style={[styles.studentName, { color: colors.text }]}>{userProfile?.displayName}</Text>
          <Text style={[styles.classTag, { color: colors.gold }]}>
            {userProfile?.classId} {userProfile?.stream} • {userProfile?.level} (Parent Account Linked)
          </Text>
        </View>
        <TouchableOpacity style={[styles.logoutBtn, { borderColor: colors.gold, backgroundColor: colors.gold + '15' }]} onPress={handleLogout}>
          <FontAwesome5 name="sign-out-alt" size={13} color={colors.gold} />
          <Text style={[styles.logoutBtnText, { color: colors.gold }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {/* 1. Academic Billboard Display (Highest JAB Forecast Match) */}
      <View style={[styles.billboardFrame, { borderColor: colors.gold, backgroundColor: colors.backgroundElement }]}>
        <View style={[styles.billboardRibbon, { backgroundColor: colors.primary }]}>
          <FontAwesome5 name="award" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.ribbonText}>PRESTIGE ADMISSION FORECAST MATCH</Text>
        </View>
        
        {topMatch ? (
          <View style={styles.billboardContent}>
            <Text style={[styles.billboardHeadline, { color: colors.text }]}>
              Your best performed track is {userProfile?.level === 'A-Level' ? 'Sciences' : 'Technical'}. You are eligible for entry in:
            </Text>
            
            <Text style={[styles.courseTitle, { color: colors.text }]}>
              {topMatch.course.name}
            </Text>
            
            <Text style={[styles.universityTag, { color: colors.gold }]}>
              {topMatch.course.institution} • {topMatch.course.duration}
            </Text>

            {/* Cutoff visual stats */}
            {userProfile?.level === 'A-Level' && (
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>{topMatch.totalWeight.toFixed(2)}</Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Your JAB Weight</Text>
                </View>
                <View style={[styles.verticalDivider, { backgroundColor: colors.gold }]} />
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.primary }]}>
                    {(topMatch.course.governmentCutOff || 45.0).toFixed(2)}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Govt Cutoff</Text>
                </View>
                <View style={[styles.verticalDivider, { backgroundColor: colors.gold }]} />
                <View style={styles.statBox}>
                  <Text style={[styles.statValue, { color: colors.success }]}>
                    {topMatch.eligibility === 'High' ? 'GOVT ELIGIBLE' : 'PRIVATE'}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Sponsorship</Text>
                </View>
              </View>
            )}

            <Text style={[styles.billboardReasoning, { color: colors.textSecondary }]}>
              {topMatch.reason}
            </Text>

            <TouchableOpacity 
              style={[styles.billboardBtn, { backgroundColor: colors.primary }]}
              onPress={() => router.push(`/course/${topMatch.course.id}`)}
            >
              <Text style={styles.billboardBtnText}>View Course Details & Careers</Text>
              <FontAwesome5 name="chevron-right" size={11} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.billboardEmpty}>
            <FontAwesome5 name="chart-line" size={32} color={colors.gold} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyHeadline, { color: colors.text }]}>No Forecast Computed</Text>
            <Text style={[styles.emptySubText, { color: colors.textSecondary }]}>
              Once teachers upload your term marks sheet, your JAB entry recommendations will compile instantly!
            </Text>
          </View>
        )}
      </View>

      {/* 2. GPA Average & Courswork Weighted Progress */}
      <View style={styles.gradesRow}>
        <View style={[styles.gradeCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
          <View style={[styles.circularIndicator, { borderColor: colors.gold }]}>
            <Text style={[styles.averageVal, { color: colors.text }]}>{termAverage}%</Text>
          </View>
          <Text style={[styles.averageLbl, { color: colors.text }]}>Overall Term GPA</Text>
          <Text style={[styles.averageSub, { color: colors.textSecondary }]}>Weighted Average</Text>
        </View>

        <View style={[styles.weightProgressCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
          <Text style={[styles.cardHeader, { color: colors.text }]}>Assessment Weights</Text>
          <View style={styles.weightItem}>
            <View style={styles.weightLabels}>
              <Text style={[styles.weightName, { color: colors.text }]}>Continuous Assessment</Text>
              <Text style={[styles.weightPct, { color: colors.gold }]}>20%</Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: colors.background }]}>
              <View style={[styles.progressBarFill, { backgroundColor: colors.gold, width: '20%' }]} />
            </View>
          </View>

          <View style={styles.weightItem}>
            <View style={styles.weightLabels}>
              <Text style={[styles.weightName, { color: colors.text }]}>End of Term Exams</Text>
              <Text style={[styles.weightPct, { color: colors.primary }]}>80%</Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: colors.background }]}>
              <View style={[styles.progressBarFill, { backgroundColor: colors.primary, width: '80%' }]} />
            </View>
          </View>
          <Text style={[styles.weightCaption, { color: colors.textSecondary }]}>
            Strictly aligned with Nabisunsa's formal academic grading syllabus.
          </Text>
        </View>
      </View>

      {/* 3. High-End Quick Action Grid */}
      <Text style={[styles.sectionTitle, { color: colors.text }]}>E-Learning & Portals</Text>
      <View style={styles.gridContainer}>
        <TouchableOpacity 
          style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
          onPress={() => router.push('/(tabs)/classroom')}
        >
          <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
            <FontAwesome5 name="video" size={16} color={colors.gold} />
          </View>
          <Text style={[styles.gridItemTitle, { color: colors.text }]}>Watch Lessons</Text>
          <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>GDrive Streams</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
          onPress={() => router.push('/report-card')}
        >
          <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
            <FontAwesome5 name="file-pdf" size={16} color={colors.gold} />
          </View>
          <Text style={[styles.gridItemTitle, { color: colors.text }]}>Report Cards</Text>
          <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Export PDFs</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
          onPress={() => router.push('/ai-chat')}
        >
          <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
            <FontAwesome5 name="robot" size={16} color={colors.gold} />
          </View>
          <Text style={[styles.gridItemTitle, { color: colors.text }]}>AI Counselor</Text>
          <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Gemini Advising</Text>
        </TouchableOpacity>

        {(userProfile?.role as string) === 'system_owner' && (
          <TouchableOpacity 
            style={[styles.gridItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
            onPress={() => router.push('/developer')}
          >
            <View style={[styles.gridIconBg, { backgroundColor: colors.champagne }]}>
              <FontAwesome5 name="cogs" size={16} color={colors.gold} />
            </View>
            <Text style={[styles.gridItemTitle, { color: colors.text }]}>Dev Console</Text>
            <Text style={[styles.gridItemSub, { color: colors.textSecondary }]}>Active Locks</Text>
          </TouchableOpacity>
        )}
      </View>

      {renderHallOfFameAndAnnouncements()}
      <View style={styles.academicFooter}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Nabisunsa Girls' Secondary School App • Academic Year {new Date().getFullYear()}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: Spacing.five,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  welcomeText: {
    fontSize: 13,
    fontWeight: '500',
  },
  studentName: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  classTag: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  billboardFrame: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    overflow: 'hidden',
    marginBottom: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  billboardRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: Spacing.three,
  },
  ribbonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
  },
  billboardContent: {
    padding: Spacing.four,
  },
  billboardHeadline: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  courseTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
    marginBottom: Spacing.one,
  },
  universityTag: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#EAE5D5',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  verticalDivider: {
    width: 1,
    height: 24,
  },
  billboardReasoning: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: Spacing.four,
  },
  billboardBtn: {
    flexDirection: 'row',
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billboardBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  billboardEmpty: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyHeadline: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: Spacing.one,
  },
  emptySubText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.three,
  },
  gradesRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  gradeCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularIndicator: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  averageVal: {
    fontSize: 16,
    fontWeight: '800',
  },
  averageLbl: {
    fontSize: 13,
    fontWeight: '700',
  },
  averageSub: {
    fontSize: 10,
    marginTop: 2,
  },
  weightProgressCard: {
    flex: 1.5,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  weightItem: {
    marginBottom: Spacing.two,
  },
  weightLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  weightName: {
    fontSize: 11,
    fontWeight: '600',
  },
  weightPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
  },
  weightCaption: {
    fontSize: 9,
    fontStyle: 'italic',
    lineHeight: 12,
    marginTop: Spacing.one,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.three,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
    marginBottom: Spacing.five,
  },
  gridItem: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  gridIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  gridItemTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  gridItemSub: {
    fontSize: 10,
    marginTop: 2,
  },
  academicFooter: {
    alignItems: 'center',
    marginVertical: Spacing.three,
  },
  footerText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  classItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  classIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0F20421A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.three,
  },
  smallActionBtn: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementCard: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.01,
    shadowRadius: 4,
    elevation: 1,
  },
  annHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  annTitle: {
    fontSize: 13,
    flex: 1,
    paddingRight: 6,
    fontWeight: '700',
  },
  pinnedBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  unreadBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  annBody: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  hallOfFameContainer: {
    borderWidth: 1,
    borderRadius: Spacing.four,
    overflow: 'hidden',
    marginBottom: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '700',
  },
  leaderboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
  },
  leaderboardBadge: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginLeft: 6,
  },
  termSelectorScroll: {
    marginVertical: Spacing.two,
  },
  termPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: 20,
    borderWidth: 1,
  },
  activeTermPill: {
    borderWidth: 1.5,
  },
  termPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  activeTermPillText: {
    fontWeight: '800',
  },
  classSectionCard: {
    borderWidth: 1,
    borderColor: '#EAE5D530',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  classSectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.two,
  },
  championsFlexRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  championHalfCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignItems: 'center',
  },
  trackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginBottom: Spacing.two,
    gap: 4,
  },
  trackBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  scienceTrack: {},
  artsTrack: {},
  championHalfName: {
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 2,
    textAlign: 'center',
  },
  championHalfScore: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  tapDetailsIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.four,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  certificateFrame: {
    borderWidth: 2,
    margin: 8,
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  certRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  certRibbonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.0,
    textAlign: 'center',
  },
  certAvatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: Spacing.three,
    backgroundColor: '#0F204205',
  },
  laurelWreathBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  certStudentName: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  certSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  certStatsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    width: '100%',
    paddingVertical: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    marginBottom: Spacing.four,
  },
  certStatCard: {
    alignItems: 'center',
    flex: 1,
  },
  certStatVal: {
    fontSize: 15,
    fontWeight: '800',
  },
  certStatLbl: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  teacherPraiseBox: {
    borderLeftWidth: 3,
    padding: Spacing.three,
    borderRadius: Spacing.one,
    marginBottom: Spacing.four,
    width: '100%',
  },
  teacherPraiseText: {
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  certTranscriptTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    marginBottom: Spacing.two,
    letterSpacing: 0.5,
  },
  certGradesList: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    marginBottom: Spacing.two,
  },
  certGradeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
  },
  certGradeSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  certGradeVal: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  modalCloseBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  cardAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginVertical: Spacing.two,
  },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  rowClassBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  rowClassBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  certAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
});
