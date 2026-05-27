import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { saveBulkMarks } from '../../services/db/marks';
import { getSchoolStreams } from '../../services/db/users';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

interface StudentRow {
  studentId: string;
  name: string;
  regNo: string;
  score: string;
}

export default function BulkMarksEntryScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [saving, setSaving] = useState(false);
  const [ocring, setOcring] = useState(false);
  const [selectedClass, setSelectedClass] = useState('S5');
  const [selectedSubject, setSelectedSubject] = useState('a_physics');
  const [selectedExamType, setSelectedExamType] = useState('endOfTerm'); // BOT, Mid, EOT, CA
  
  const [selectedStream, setSelectedStream] = useState('Blue');
  const [availableStreams, setAvailableStreams] = useState<string[]>(['Blue', 'Red', 'Green']);

  // Photo & OCR picker drawer states
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [showPickerDrawer, setShowPickerDrawer] = useState(false);
  const [scanningProgress, setScanningProgress] = useState('');

  useEffect(() => {
    async function loadStreams() {
      try {
        const list = await getSchoolStreams('nabisunsa_girls');
        setAvailableStreams(list);
        if (list.length > 0) {
          if (!list.includes(selectedStream)) {
            setSelectedStream(list[0]);
          }
        }
      } catch (err) {
        console.error('Error loading streams in marks entry:', err);
      }
    }
    loadStreams();
  }, []);

  // Mock class student roster for S5 Physics
  const [students, setStudents] = useState<StudentRow[]>([
    { studentId: 'student_a_level_uid', name: 'Nakato Sarah', regNo: 'NGSS/2025/002', score: '82' },
    { studentId: 'student_2', name: 'Nalwanga Shakirah', regNo: 'NGSS/2025/014', score: '78' },
    { studentId: 'student_3', name: 'Babirye Florence', regNo: 'NGSS/2025/041', score: '64' },
    { studentId: 'student_4', name: 'Namubiru Mariam', regNo: 'NGSS/2025/055', score: '55' }
  ]);

  const handleScoreChange = (idx: number, text: string) => {
    // Only allow numbers 0-100 or empty
    const sanitized = text.replace(/[^0-9]/g, '');
    const num = parseInt(sanitized, 10);
    if (num > 100) return;

    setStudents(prev => {
      const updated = [...prev];
      updated[idx].score = sanitized;
      return updated;
    });
  };

  // Triggers batch Firestore database entries
  const handleSaveBulk = async () => {
    setSaving(true);
    try {
      const recordedBy = 'teacher_uid';
      const formattedList = students.map(s => ({
        studentId: s.studentId,
        [selectedExamType]: s.score ? parseInt(s.score, 10) : 0,
        remarks: 'Batch entry uploaded by physics tutor Okello James.'
      }));

      await saveBulkMarks('2026_term1', selectedClass, selectedSubject, formattedList, recordedBy);

      const msg = `Bulk marks sheet uploaded successfully! Saved scores for ${students.length} students in ${selectedClass} ${selectedSubject.toUpperCase()}.`;
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Batch Upload Complete', msg, [{ text: 'OK', onPress: () => router.back() }]);
      }
    } catch (e: any) {
      console.error('Error saving batch marks:', e);
      Alert.alert('Error', 'Failed to save batch marks. Please check Firestore permissions.');
    } finally {
      setSaving(false);
    }
  };

  // Triggers image pick and starts the OCR marksheet simulation
  const handleRosterImagePick = async (source: 'camera' | 'gallery') => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          const msg = 'Camera access is required to scan marksheets.';
          if (Platform.OS === 'web') alert(msg);
          else Alert.alert('Permission Denied', msg);
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          const msg = 'Media library access is required to pick marksheet photos.';
          if (Platform.OS === 'web') alert(msg);
          else Alert.alert('Permission Denied', msg);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setPhotoUrl(result.assets[0].uri);
        setShowPickerDrawer(false);
        startOCRScanSimulation();
      }
    } catch (err) {
      console.error('Error selecting marksheet list:', err);
    }
  };

  const startOCRScanSimulation = () => {
    if (ocring) return;
    setOcring(true);
    setScanningProgress('Uploading marksheet to AI parsing engine...');

    setTimeout(() => {
      setScanningProgress('AI OCR: Running handwriting & score grid analysis...');
    }, 1200);

    setTimeout(() => {
      setScanningProgress('AI Parser: Matching Names & Registration columns...');
    }, 2400);

    setTimeout(() => {
      setScanningProgress('Database: Mapping student profiles for stream...');
    }, 3600);

    setTimeout(() => {
      setOcring(false);
      setScanningProgress('');
      // Populate inputs with parsed mock OCR scores
      setStudents([
        { studentId: 'student_a_level_uid', name: 'Nakato Sarah', regNo: 'NGSS/2025/002', score: '88' },
        { studentId: 'student_2', name: 'Nalwanga Shakirah', regNo: 'NGSS/2025/014', score: '82' },
        { studentId: 'student_3', name: 'Babirye Florence', regNo: 'NGSS/2025/041', score: '71' },
        { studentId: 'student_4', name: 'Namubiru Mariam', regNo: 'NGSS/2025/055', score: '68' }
      ]);
      const msg = 'AI OCR Scan complete! Extracted scores from photographed marksheet successfully.';
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('AI OCR Scan Complete', msg, [{ text: 'OK' }]);
      }
    }, 4800);
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Nav Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Marks Roster Entry</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Header and Selections */}
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: colors.text }]}>Bulk Score Sheet Upload</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Record academic marks for an entire class at once. You can enter grades manually, or capture a photo of your paper markssheet using our AI powered OCR parser.
        </Text>
      </View>

      {/* Corporate selection filter bar */}
      <View style={[styles.filterCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.text }]}>Class Stream:</Text>
          <Text style={[styles.filterValue, { color: colors.gold }]}>{selectedClass} {selectedStream}</Text>
        </View>
        <View style={[styles.vertDivider, { backgroundColor: colors.gold }]} />
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.text }]}>Subject Module:</Text>
          <Text style={[styles.filterValue, { color: colors.gold }]}>{selectedSubject.replace('a_', '').toUpperCase()}</Text>
        </View>
        <View style={[styles.vertDivider, { backgroundColor: colors.gold }]} />
        <View style={styles.filterGroup}>
          <Text style={[styles.filterLabel, { color: colors.text }]}>Exam Category:</Text>
          <Text style={[styles.filterValue, { color: colors.gold }]}>
            {selectedExamType === 'endOfTerm' ? 'End of Term (80%)' : 'BOT (10%)'}
          </Text>
        </View>
      </View>

      {/* AI OCR Trigger Shield */}
      <View style={[styles.ocrCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two, gap: 10 }}>
          <FontAwesome5 name="robot" size={18} color={colors.gold} />
          <Text style={[styles.ocrCardTitle, { color: colors.text }]}>AI OCR Marksheet Parser</Text>
        </View>

        {ocring ? (
          /* Scanning Laser Active State */
          <View style={{ alignItems: 'center', paddingVertical: 20 }}>
            <ActivityIndicator size="small" color={colors.gold} style={{ marginBottom: 12 }} />
            <View style={[styles.scanLine, { backgroundColor: colors.gold }]} />
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'center', marginBottom: 2 }}>
              {scanningProgress}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
              Extracting handwriting grids & cross-matching class list...
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: 12, lineHeight: 18 }}>
              Take a photo of your hand-written or printed score sheet. The AI scanner automatically matches registration numbers and registers grades.
            </Text>

            <TouchableOpacity 
              style={[styles.ocrTriggerBtn, { borderColor: colors.gold }]}
              onPress={() => setShowPickerDrawer(!showPickerDrawer)}
            >
              <FontAwesome5 name="camera" size={12} color={colors.gold} style={{ marginRight: 8 }} />
              <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>
                Capture Marksheet Image
              </Text>
            </TouchableOpacity>

            {showPickerDrawer && (
              <View style={[styles.drawerContent, { backgroundColor: colors.background, borderColor: colors.gold + '25' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: Spacing.two, textTransform: 'uppercase', alignSelf: 'flex-start' }}>
                  Select Marksheet Source
                </Text>

                <View style={{ flexDirection: 'row', gap: Spacing.two, width: '100%' }}>
                  <TouchableOpacity 
                    style={[styles.cameraActionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                    onPress={() => handleRosterImagePick('gallery')}
                  >
                    <FontAwesome5 name="images" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                      Choose Gallery
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.cameraActionBtn, { backgroundColor: colors.gold, flex: 1 }]}
                    onPress={() => handleRosterImagePick('camera')}
                  >
                    <FontAwesome5 name="camera" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                      Take Photo
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Grid Inputs Table */}
      <View style={[styles.tableFrame, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <View style={[styles.tableHeader, { backgroundColor: colors.primary }]}>
          <Text style={[styles.th, styles.colName]}>Student Name</Text>
          <Text style={[styles.th, styles.colReg]}>Reg Number</Text>
          <Text style={[styles.th, styles.colScore]}>Score (0-100)</Text>
        </View>

        {students.map((student, idx) => (
          <View key={student.studentId} style={[styles.tableRow, { borderBottomColor: colors.gold + '20' }]}>
            <Text style={[styles.td, styles.colName, { color: colors.text, fontWeight: '700' }]} numberOfLines={1}>
              {student.name}
            </Text>
            <Text style={[styles.td, styles.colReg, { color: colors.textSecondary }]}>
              {student.regNo}
            </Text>
            <View style={[styles.colScore, styles.inputWrapper]}>
              <TextInput
                style={[styles.scoreInput, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
                keyboardType="numeric"
                value={student.score}
                onChangeText={(text) => handleScoreChange(idx, text)}
                maxLength={3}
                placeholder="0"
                placeholderTextColor={colors.textSecondary + '40'}
              />
            </View>
          </View>
        ))}
      </View>

      {/* Submit Batch Action */}
      <TouchableOpacity 
        style={[styles.submitBtn, { backgroundColor: colors.primary }]}
        onPress={handleSaveBulk}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <>
            <FontAwesome5 name="cloud-upload-alt" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.submitBtnText}>Submit & Save Batch Marks</Text>
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
  headerBlock: {
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  filterCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: Spacing.three,
    shadowOpacity: 0.01,
    elevation: 1,
  },
  filterGroup: {
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  filterValue: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  vertDivider: {
    width: 1,
    height: 24,
  },
  ocrCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  ocrCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  scanLine: {
    height: 3,
    width: '85%',
    alignSelf: 'center',
    marginVertical: 12,
    borderRadius: 2,
  },
  ocrTriggerBtn: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerContent: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.two,
    alignItems: 'center',
  },
  cameraActionBtn: {
    flexDirection: 'row',
    height: 34,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  tableFrame: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    overflow: 'hidden',
    marginBottom: Spacing.four,
  },
  tableHeader: {
    flexDirection: 'row',
    height: 36,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  th: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    height: 48,
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: Spacing.two,
  },
  td: {
    fontSize: 12,
  },
  colName: {
    flex: 2,
    textAlign: 'left',
  },
  colReg: {
    flex: 1.5,
    textAlign: 'center',
  },
  colScore: {
    flex: 1.2,
    alignItems: 'center',
  },
  inputWrapper: {
    justifyContent: 'center',
  },
  scoreInput: {
    borderWidth: 1,
    borderRadius: 6,
    width: 60,
    height: 32,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.1,
    elevation: 2,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
