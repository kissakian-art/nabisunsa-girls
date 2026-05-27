import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db, isMockMode } from '../services/firebase';
import { getUserProfile } from '../services/db/users';
import { getStudentMarksForTerm } from '../services/db/marks';
import { User, Marks, Subject } from '../types';
import { Colors, Spacing, MaxContentWidth } from '../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { collection, getDocs } from 'firebase/firestore';

export default function ReportCardScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [marks, setMarks] = useState<Marks[]>([]);
  const [subjectsList, setSubjectsList] = useState<Subject[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    async function loadReportDetails() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const profile = await getUserProfile(currentUser.uid);
        setUserProfile(profile);

        if (profile) {
          const studentMarks = await getStudentMarksForTerm(currentUser.uid, '2026_term1');
          setMarks(studentMarks);

          if (isMockMode) {
            const { DEFAULT_SUBJECTS } = require('../scripts/seedData');
            setSubjectsList(DEFAULT_SUBJECTS);
          } else {
            const subSnap = await getDocs(collection(db, 'subjects'));
            const allSubs = subSnap.docs.map(d => d.data() as Subject);
            setSubjectsList(allSubs);
          }
        }
      } catch (e) {
        console.error('Error loading report card:', e);
      } finally {
        setLoading(false);
      }
    }

    loadReportDetails();
  }, []);

  // Simulates creating and opening a share dialog for the PDF report card
  const handleExportPDF = () => {
    if (exporting) return;
    setExporting(true);

    setTimeout(() => {
      setExporting(false);
      const msg = `Academic Report Card for ${userProfile?.displayName || 'Student'} (Term 1) compiled successfully. Ready for sharing / printing!`;
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Report Card PDF Exported', msg, [{ text: 'Close Portal' }]);
      }
    }, 1500);
  };

  const getSubjectName = (subId: string) => {
    const sub = subjectsList.find(s => s.id === subId);
    return sub ? sub.name : subId.replace('a_', '').replace('o_', '').toUpperCase();
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Nav Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Academic Transcript</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Report Card Frame (Styled like a formal paper crest transcript) */}
      <View style={[styles.transcriptFrame, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        
        {/* Crest Title */}
        <View style={styles.crestHeader}>
          <FontAwesome5 name="medal" size={24} color={colors.gold} style={{ marginBottom: Spacing.one }} />
          <Text style={[styles.crestSchool, { color: colors.text }]}>NABISUNSA GIRLS' SECONDARY SCHOOL</Text>
          <Text style={[styles.crestTerm, { color: colors.textSecondary }]}>OFFICIAL ACADEMIC REPORT CARD • TERM 1</Text>
          <View style={[styles.crestDivider, { backgroundColor: colors.gold }]} />
        </View>

        {/* Student metadata */}
        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>STUDENT NAME:</Text>
            <Text style={[styles.metaVal, { color: colors.text }]}>{userProfile?.displayName}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>REGISTRATION NO:</Text>
            <Text style={[styles.metaVal, { color: colors.text }]}>{userProfile?.registrationNumber}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>CLASS STREAM:</Text>
            <Text style={[styles.metaVal, { color: colors.text }]}>{userProfile?.classId} {userProfile?.stream}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>CURRICULUM LEVEL:</Text>
            <Text style={[styles.metaVal, { color: colors.text }]}>{userProfile?.level}</Text>
          </View>
        </View>

        {/* Dynamic Grades Table Grid */}
        <View style={styles.table}>
          <View style={[styles.tableHeader, { backgroundColor: colors.primary }]}>
            <Text style={[styles.th, styles.colSub]}>Subject</Text>
            <Text style={[styles.th, styles.colMark]}>BOT</Text>
            <Text style={[styles.th, styles.colMark]}>Mid</Text>
            <Text style={[styles.th, styles.colMark]}>EOT</Text>
            <Text style={[styles.th, styles.colMark]}>CA</Text>
            <Text style={[styles.th, styles.colTotal]}>Tally</Text>
            <Text style={[styles.th, styles.colGrade]}>Grade</Text>
          </View>

          {marks.map((row, idx) => (
            <View key={idx} style={[styles.tableRow, { borderBottomColor: colors.gold + '20' }]}>
              <Text style={[styles.td, styles.colSub, { color: colors.text }]} numberOfLines={1}>
                {getSubjectName(row.subjectId)}
              </Text>
              <Text style={[styles.td, styles.colMark, { color: colors.textSecondary }]}>
                {row.beginningOfTerm ?? '-'}
              </Text>
              <Text style={[styles.td, styles.colMark, { color: colors.textSecondary }]}>
                {row.midTerm ?? '-'}
              </Text>
              <Text style={[styles.td, styles.colMark, { color: colors.textSecondary }]}>
                {row.endOfTerm ?? '-'}
              </Text>
              <Text style={[styles.td, styles.colMark, { color: colors.textSecondary }]}>
                {row.continuousAssessment ?? '-'}
              </Text>
              <Text style={[styles.td, styles.colTotal, { color: colors.text, fontWeight: '700' }]}>
                {row.finalWeightScore?.toFixed(0)}%
              </Text>
              <Text style={[styles.td, styles.colGrade, { color: colors.gold, fontWeight: '800' }]}>
                {row.finalGrade}
              </Text>
            </View>
          ))}
        </View>

        {/* Signatures Panel */}
        <View style={styles.signaturesBar}>
          <View style={styles.sigBlock}>
            <Text style={[styles.sigLine, { color: colors.textSecondary }]}>________________________</Text>
            <Text style={[styles.sigTitle, { color: colors.text }]}>Okello James</Text>
            <Text style={[styles.sigRole, { color: colors.textSecondary }]}>Classroom Tutor</Text>
          </View>

          <View style={styles.sigBlock}>
            <Text style={[styles.sigLine, { color: colors.textSecondary }]}>________________________</Text>
            <Text style={[styles.sigTitle, { color: colors.text }]}>Hajati Zaminah</Text>
            <Text style={[styles.sigRole, { color: colors.textSecondary }]}>Headmistress</Text>
          </View>
        </View>
      </View>

      {/* Export Action */}
      <TouchableOpacity 
        style={[styles.exportBtn, { backgroundColor: colors.primary }]}
        onPress={handleExportPDF}
        disabled={exporting}
      >
        {exporting ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <FontAwesome5 name="file-pdf" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.exportBtnText}>Share / Export Report Card PDF</Text>
          </>
        )}
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
  transcriptFrame: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  crestHeader: {
    alignItems: 'center',
    marginBottom: Spacing.four,
  },
  crestSchool: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.0,
    textAlign: 'center',
    marginBottom: 4,
  },
  crestTerm: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  crestDivider: {
    width: 60,
    height: 1.5,
    marginTop: Spacing.two,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#0F204205',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginBottom: Spacing.four,
    gap: Spacing.three,
  },
  metaItem: {
    width: '45%',
    flexGrow: 1,
  },
  metaLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  metaVal: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  table: {
    width: '100%',
    marginBottom: Spacing.five,
  },
  tableHeader: {
    flexDirection: 'row',
    height: 32,
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
  },
  th: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    height: 38,
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.one,
  },
  td: {
    fontSize: 11,
    textAlign: 'center',
  },
  colSub: {
    flex: 2,
    textAlign: 'left',
    paddingLeft: Spacing.one,
  },
  colMark: {
    flex: 1,
  },
  colTotal: {
    flex: 1.2,
  },
  colGrade: {
    flex: 1,
  },
  signaturesBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.three,
    paddingTop: Spacing.three,
  },
  sigBlock: {
    alignItems: 'center',
  },
  sigLine: {
    fontSize: 10,
    marginBottom: 4,
  },
  sigTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  sigRole: {
    fontSize: 10,
    marginTop: 2,
  },
  exportBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  exportBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
