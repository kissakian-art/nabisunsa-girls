import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth } from '../../services/firebase';
import { getUserProfile } from '../../services/db/users';
import { getStudentMarksForTerm } from '../../services/db/marks';
import { getCourseById } from '../../services/db/courses';
import { calculateCourseWeight } from '../../services/careerAdvisor';
import { User, Marks, Course } from '../../types';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function CourseDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const courseId = params.id as string;
  
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(true);
  const [course, setCourse] = useState<Course | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [weightResult, setWeightResult] = useState<{
    totalWeight: number;
    uceContribution: number;
    aLevelWeight: number;
    affirmativeAction: number;
    breakdown: string[];
  } | null>(null);

  useEffect(() => {
    async function loadCourseDetails() {
      if (!courseId) return;

      try {
        // 1. Fetch Course details
        const courseData = await getCourseById(courseId);
        setCourse(courseData);

        // 2. Fetch student details and calculate custom weight
        const currentUser = auth.currentUser;
        if (currentUser && courseData) {
          const profile = await getUserProfile(currentUser.uid);
          setUserProfile(profile);

          if (profile) {
            const studentMarks = await getStudentMarksForTerm(currentUser.uid, '2026_term1');
            
            const subjectsMap = studentMarks.reduce((acc, curr) => {
              acc[curr.subjectId] = curr.finalGrade || 'F';
              return acc;
            }, {} as Record<string, string>);

            const uaceGrades = {
              subject1: { id: (profile.subjects || [])[0] || 'a_mathematics', grade: (subjectsMap[(profile.subjects || [])[0]] || 'A') as any },
              subject2: { id: (profile.subjects || [])[1] || 'a_physics', grade: (subjectsMap[(profile.subjects || [])[1]] || 'B') as any },
              subject3: { id: (profile.subjects || [])[2] || 'a_chemistry', grade: (subjectsMap[(profile.subjects || [])[2]] || 'C') as any },
              generalPaperPassed: true,
              subsidiaryPassed: true
            };

            const uceGradesList = Object.entries(profile.uceGrades || {}).map(([subId, gr]) => ({
              subjectId: subId,
              subjectName: subId.replace('o_', '').toUpperCase(),
              grade: gr
            }));

            // Calculate precise mathematical JAB weighting
            const calc = calculateCourseWeight(uceGradesList, uaceGrades, courseData);
            setWeightResult(calc);
          }
        }
      } catch (e) {
        console.error('Error loading course details:', e);
      } finally {
        setLoading(false);
      }
    }

    loadCourseDetails();
  }, [courseId]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!course) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Course not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Header Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Course Details</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Course Core Header */}
      <View style={styles.courseHeader}>
        <Text style={[styles.courseName, { color: colors.text }]}>{course.name}</Text>
        <Text style={[styles.universityTag, { color: colors.gold }]}>
          {course.institution} • {course.duration} ({course.institutionType})
        </Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          {course.careerDetails.description}
        </Text>
      </View>

      {/* 1. Precise JAB Weight Breakdown (Academic Core Value) */}
      {!course.isVocational && weightResult && (
        <View style={[styles.sectionCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
          <Text style={[styles.cardHeader, { color: colors.text }]}>Your JAB Weight Formula Tally</Text>
          
          <View style={styles.weightSummaryRow}>
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: colors.primary }]}>{weightResult.totalWeight.toFixed(2)}</Text>
              <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Your Score</Text>
            </View>
            <View style={[styles.vertDivider, { backgroundColor: colors.gold }]} />
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: colors.primary }]}>
                {(course.governmentCutOff || 45.0).toFixed(2)}
              </Text>
              <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Govt Cutoff</Text>
            </View>
            <View style={[styles.vertDivider, { backgroundColor: colors.gold }]} />
            <View style={styles.summaryBox}>
              <Text style={[styles.summaryVal, { color: colors.primary }]}>
                {(course.privateCutOff || 32.0).toFixed(2)}
              </Text>
              <Text style={[styles.summaryLbl, { color: colors.textSecondary }]}>Private Cutoff</Text>
            </View>
          </View>

          {/* Mathematical breakdowns */}
          <View style={styles.formulaList}>
            <Text style={[styles.formulaHeader, { color: colors.text }]}>Calculation Breakdown:</Text>
            {weightResult.breakdown.map((row, idx) => (
              <View key={idx} style={styles.formulaRow}>
                <FontAwesome5 name="calculator" size={10} color={colors.gold} style={{ marginRight: 8, marginTop: 4 }} />
                <Text style={[styles.formulaText, { color: colors.textSecondary }]}>{row}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 2. Higher Education Requirements Check */}
      <View style={[styles.sectionCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <Text style={[styles.cardHeader, { color: colors.text }]}>A-Level Subject Grouping Setup</Text>
        <View style={styles.reqGroup}>
          <Text style={[styles.reqGroupTitle, { color: colors.text }]}>Essential Subjects (Weight ×3):</Text>
          <Text style={[styles.reqGroupValue, { color: colors.textSecondary }]}>
            {course.uaceRequirements.essential.map(s => s.replace('a_', '').toUpperCase()).join(', ') || 'None'}
          </Text>
        </View>
        
        <View style={styles.reqGroup}>
          <Text style={[styles.reqGroupTitle, { color: colors.text }]}>Relevant Subjects (Weight ×2):</Text>
          <Text style={[styles.reqGroupValue, { color: colors.textSecondary }]}>
            {course.uaceRequirements.relevant.map(s => s.replace('a_', '').toUpperCase()).join(', ') || 'None'}
          </Text>
        </View>

        <View style={styles.reqGroup}>
          <Text style={[styles.reqGroupTitle, { color: colors.text }]}>Desirable Subjects (Weight ×1):</Text>
          <Text style={[styles.reqGroupValue, { color: colors.textSecondary }]}>
            General Paper (GP), Subsidiary Math / Subsidiary ICT (Sub-ICT)
          </Text>
        </View>
      </View>

      {/* 3. Career & Placement Outlook */}
      <View style={[styles.sectionCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <Text style={[styles.cardHeader, { color: colors.text }]}>Career Placement & Salaries</Text>
        
        <View style={styles.statsGrid}>
          <View style={styles.gridBox}>
            <Text style={[styles.gridVal, { color: colors.primary }]}>{course.careerDetails.averageStartingSalary}</Text>
            <Text style={[styles.gridLbl, { color: colors.textSecondary }]}>Avg Monthly Salary (UGX)</Text>
          </View>
          <View style={styles.gridBox}>
            <Text style={[styles.gridVal, { color: colors.success }]}>{course.careerDetails.growthProspects}</Text>
            <Text style={[styles.gridLbl, { color: colors.textSecondary }]}>EAC Growth Outlook</Text>
          </View>
        </View>

        <Text style={[styles.prospectText, { color: colors.textSecondary }]}>
          {course.careerDetails.prospectsReasoning}
        </Text>

        <View style={styles.jobsList}>
          <Text style={[styles.jobsHeader, { color: colors.text }]}>Target Professional Placements:</Text>
          {course.careerDetails.jobs.map((job, idx) => (
            <View key={idx} style={styles.jobItem}>
              <FontAwesome5 name="briefcase" size={10} color={colors.gold} style={{ marginRight: 8, marginTop: 4 }} />
              <Text style={[styles.jobText, { color: colors.text }]}>{job}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 4. Action: Query AI Career Advisor */}
      <TouchableOpacity 
        style={[styles.aiQueryBtn, { backgroundColor: colors.primary }]}
        onPress={() => router.push({
          pathname: '/ai-chat',
          params: { initialPrompt: `Tell me more about doing ${course.name} from ${course.institution}. What are the top companies in Uganda that hire for this?` }
        })}
      >
        <FontAwesome5 name="robot" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.aiQueryText}>Discuss with AI Counselor</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: Spacing.six,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.four,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  courseHeader: {
    marginBottom: Spacing.four,
  },
  courseName: {
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 26,
    marginBottom: 6,
  },
  universityTag: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: Spacing.three,
  },
  desc: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.three,
  },
  weightSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#EAE5D5',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  summaryBox: {
    alignItems: 'center',
  },
  summaryVal: {
    fontSize: 18,
    fontWeight: '800',
  },
  summaryLbl: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  vertDivider: {
    width: 1,
    height: 28,
  },
  formulaList: {
    marginTop: Spacing.two,
  },
  formulaHeader: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  formulaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.one,
  },
  formulaText: {
    fontSize: 11,
    lineHeight: 16,
  },
  reqGroup: {
    marginBottom: Spacing.two,
  },
  reqGroupTitle: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  reqGroupValue: {
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  gridBox: {
    flex: 1,
    backgroundColor: '#0F20420A',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridVal: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
  gridLbl: {
    fontSize: 9,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  prospectText: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.three,
  },
  jobsList: {
    marginTop: Spacing.two,
  },
  jobsHeader: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: Spacing.two,
  },
  jobItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  jobText: {
    fontSize: 12,
    fontWeight: '600',
  },
  aiQueryBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  aiQueryText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
