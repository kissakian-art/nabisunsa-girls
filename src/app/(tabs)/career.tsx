import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db, isMockMode } from '../../services/firebase';
import { getUserProfile } from '../../services/db/users';
import { getStudentMarksForTerm } from '../../services/db/marks';
import { getCourses } from '../../services/db/courses';
import { getRecommendations, checkCombinationEligibility, RecommendationResult } from '../../services/careerAdvisor';
import { User, Marks, Course, Combination } from '../../types';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, getDocs } from 'firebase/firestore';

// Helper to determine UNEB Subsidiary advice based on chosen A-Level principal subjects
const getSubsidiaryAdvice = (combinationId: string, principalSubjects: string[]): string => {
  const hasPrincipalMath = principalSubjects.includes('a_mathematics');
  const hasEconomics = principalSubjects.includes('a_economics');
  const isScienceComp = principalSubjects.some(s => ['a_physics', 'a_chemistry', 'a_biology', 'a_agriculture'].includes(s));
  const hasScienceWithoutMath = isScienceComp && !hasPrincipalMath;

  if (hasPrincipalMath) {
    return 'Mandatory Subsidiary: Subsidiary ICT (Sub-ICT) — UNEB regulations require all Principal Mathematics students to offer Sub-ICT.';
  }
  
  if ((hasEconomics && !hasPrincipalMath) || hasScienceWithoutMath) {
    return 'Mandatory Subsidiary: Subsidiary Mathematics (Sub-Math) — UNEB regulations require Sub-Math for students offering Economics without Principal Math, or Sciences without Principal Math.';
  }

  return 'Subsidiary Option: Choose freely between Subsidiary Mathematics (Sub-Math) and Subsidiary ICT (Sub-ICT).';
};

export default function CareerScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendations, setRecommendations] = useState<RecommendationResult[]>([]);
  const [combRecommendations, setCombRecommendations] = useState<Array<{
    combination: Combination;
    eligible: boolean;
    confidence: 'High' | 'Medium' | 'Low';
    reasons: string[];
  }>>([]);

  useEffect(() => {
    async function loadCareerAdvice() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);

        if (profile) {
          const termId = '2026_term1';
          const studentMarks = await getStudentMarksForTerm(currentUser.uid, termId);
          const coursesList = await getCourses();

          // 1. A-Level Student Flow: Calculate university admission weights
          if (profile.level === 'A-Level') {
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

            const matches = getRecommendations(uceGradesList, uaceGrades, coursesList);
            setRecommendations(matches);
          } 
          // 2. O-Level Student Flow: Recommend best A-Level subject combinations
          else if (profile.level === 'O-Level') {
            // Fetch combinations collection
            let combinationsList: Combination[] = [];
            if (isMockMode) {
              const { DEFAULT_COMBINATIONS } = require('../../scripts/seedData');
              combinationsList = DEFAULT_COMBINATIONS;
            } else {
              const combSnap = await getDocs(collection(db, 'combinations'));
              combinationsList = combSnap.docs.map(d => d.data() as Combination);
            }

            // Construct student marks map for requirements check
            const marksMap = studentMarks.reduce((acc, curr) => {
              // Convert final score (0-100) to standard UCE grade (1-9)
              let uceGrade = 9;
              const val = curr.finalWeightScore || 0;
              if (val >= 90) uceGrade = 1;
              else if (val >= 80) uceGrade = 2;
              else if (val >= 75) uceGrade = 3;
              else if (val >= 70) uceGrade = 4;
              else if (val >= 65) uceGrade = 5;
              else if (val >= 60) uceGrade = 6;
              else if (val >= 50) uceGrade = 7;
              else if (val >= 40) uceGrade = 8;
              
              acc[curr.subjectId] = uceGrade;
              return acc;
            }, {} as Record<string, number>);

            // Run eligibility matches
            const combMatches = combinationsList.map(comb => {
              const check = checkCombinationEligibility(marksMap, comb);
              return {
                combination: comb,
                eligible: check.eligible,
                confidence: check.confidence,
                reasons: check.reasons
              };
            });

            // Sort: Eligible first, then confidence High -> Medium -> Low
            setCombRecommendations(
              combMatches.sort((a, b) => {
                if (a.eligible === b.eligible) {
                  const ord = { High: 0, Medium: 1, Low: 2 };
                  return ord[a.confidence] - ord[b.confidence];
                }
                return a.eligible ? -1 : 1;
              })
            );

            // Set vocational recommendations in the courses segment
            const vocationalTracks = coursesList.filter(c => c.isVocational).map(c => ({
              course: c,
              totalWeight: 0,
              eligibility: 'High' as any,
              confidenceScore: 90,
              reason: 'Excellent hands-on holiday vacation program to establish specialized industry crafts.',
              breakdown: []
            }));
            setRecommendations(vocationalTracks);
          }
        }
      } catch (e) {
        console.error('Error loading career details:', e);
      } finally {
        setLoading(false);
      }
    }

    loadCareerAdvice();
  }, []);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      {/* Dynamic Header based on student Level */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>
          {userProfile?.level === 'A-Level' ? 'University Admission JAB matches' : 'A-Level Combinations & Skills'}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {userProfile?.level === 'A-Level'
            ? 'Dynamic weighting comparison with official Ugandan public university cut-offs.'
            : 'Custom calculations mapping your current grades to standard school combinations.'}
        </Text>
      </View>

      {/* 1. O-Level Flow: A-Level Combinations Recommendations */}
      {userProfile?.level === 'O-Level' && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.gold }]}>A-LEVEL COMBINATIONS FOR YOU</Text>
          {combRecommendations.map((item, idx) => (
            <View 
              key={idx} 
              style={[styles.combCard, { backgroundColor: colors.backgroundElement, borderColor: item.eligible ? colors.gold : colors.textSecondary + '40' }]}
            >
              <View style={styles.combHeader}>
                <Text style={[styles.combName, { color: colors.text }]}>{item.combination.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: item.eligible ? colors.success + '1A' : colors.error + '1A', borderColor: item.eligible ? colors.success : colors.error }]}>
                  <Text style={[styles.statusText, { color: item.eligible ? colors.success : colors.error }]}>
                    {item.eligible ? `Eligible (${item.confidence} Fit)` : 'Requirements Pending'}
                  </Text>
                </View>
              </View>
              
              <Text style={[styles.combDesc, { color: colors.textSecondary }]}>
                {item.combination.name}
              </Text>
              
              {/* Requirements details */}
              <View style={styles.requirementsList}>
                <Text style={[styles.reqHeader, { color: colors.text }]}>Syllabus Threshold Requirements:</Text>
                {item.combination.uceRequirements.map((req, rIdx) => (
                  <View key={rIdx} style={styles.reqRow}>
                    <FontAwesome5 name="check-circle" size={10} color={colors.gold} style={{ marginRight: 6, marginTop: 3 }} />
                    <Text style={[styles.reqItemText, { color: colors.textSecondary }]}>
                      {req.subjectId.replace('o_', '').toUpperCase()}: Maximum Grade C{req.maxGrade} or better.
                    </Text>
                  </View>
                ))}
              </View>

              {/* UNEB Subsidiary Advice */}
              <View style={{ borderTopWidth: 0.5, borderTopColor: colors.gold + '40', marginTop: Spacing.two, paddingTop: Spacing.two }}>
                <Text style={[styles.reqHeader, { color: colors.gold, marginBottom: 2 }]}>
                  <FontAwesome5 name="info-circle" size={10} color={colors.gold} style={{ marginRight: 4 }} /> UNEB Subsidiary Subject Rule:
                </Text>
                <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 15 }}>
                  {getSubsidiaryAdvice(item.combination.id, item.combination.subjects)}
                </Text>
              </View>

              {!item.eligible && item.reasons.length > 0 && (
                <View style={[styles.reasonsBox, { backgroundColor: colors.error + '08' }]}>
                  {item.reasons.map((reason, rIdx) => (
                    <Text key={rIdx} style={[styles.reasonText, { color: colors.error }]}>• {reason}</Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* 2. Higher Education Courses (JAB for A-Level, Vocational for O-Level) */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.gold }]}>
          {userProfile?.level === 'A-Level' ? 'ELIGIBLE UNIVERSITY DEGREES' : 'PRACTICAL HOLIDAY VACATION COURSES'}
        </Text>
        
        {recommendations.map((item, idx) => {
          let badgeColor: string = colors.success;
          let badgeBg: string = colors.success + '1A';
          if (item.eligibility === 'Borderline') {
            badgeColor = colors.warning;
            badgeBg = colors.warning + '1A';
          } else if (item.eligibility === 'Ineligible') {
            badgeColor = colors.error;
            badgeBg = colors.error + '1A';
          }

          return (
            <TouchableOpacity
              key={idx}
              style={[styles.courseCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => router.push(`/course/${item.course.id}`)}
            >
              <View style={styles.courseHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[styles.courseName, { color: colors.text }]}>{item.course.name}</Text>
                  <Text style={[styles.institutionName, { color: colors.textSecondary }]}>
                    {item.course.institution} • {item.course.duration}
                  </Text>
                </View>
                <View style={[styles.eligBadge, { backgroundColor: badgeBg, borderColor: badgeColor }]}>
                  <Text style={[styles.eligText, { color: badgeColor }]}>
                    {item.eligibility === 'High' ? 'Govt Admissible' : item.eligibility}
                  </Text>
                </View>
              </View>

              {userProfile?.level === 'A-Level' && item.eligibility !== 'Ineligible' && (
                <View style={styles.weightTally}>
                  <Text style={[styles.tallyText, { color: colors.text }]}>
                    Your JAB Admission Score: <Text style={{ fontWeight: '800' }}>{item.totalWeight.toFixed(2)}</Text>
                  </Text>
                  <Text style={[styles.tallyTarget, { color: colors.textSecondary }]}>
                    Govt Cutoff: {(item.course.governmentCutOff || 45.0).toFixed(2)}
                  </Text>
                </View>
              )}

              <Text style={[styles.courseReason, { color: colors.textSecondary }]} numberOfLines={2}>
                {item.reason}
              </Text>
              
              <View style={styles.cardFooter}>
                <Text style={[styles.viewDetailsText, { color: colors.primary }]}>View Cut-offs & Jobs</Text>
                <FontAwesome5 name="arrow-right" size={10} color={colors.primary} />
              </View>
            </TouchableOpacity>
          );
        })}
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
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    marginBottom: Spacing.five,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: Spacing.three,
  },
  combCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  combHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  combName: {
    fontSize: 16,
    fontWeight: '800',
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 3,
    paddingHorizontal: Spacing.two,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  combDesc: {
    fontSize: 12,
    marginBottom: Spacing.three,
  },
  requirementsList: {
    marginTop: Spacing.one,
  },
  reqHeader: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  reqRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  reqItemText: {
    fontSize: 11,
  },
  reasonsBox: {
    marginTop: Spacing.three,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  reasonText: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 16,
  },
  courseCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  courseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.two,
  },
  courseName: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  institutionName: {
    fontSize: 12,
    marginTop: 2,
  },
  eligBadge: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: Spacing.two,
  },
  eligText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  weightTally: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#0F20420A',
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.two,
  },
  tallyText: {
    fontSize: 12,
  },
  tallyTarget: {
    fontSize: 12,
  },
  courseReason: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.two,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  viewDetailsText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
