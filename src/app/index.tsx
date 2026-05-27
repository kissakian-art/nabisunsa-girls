import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TextInput, TouchableOpacity, ActivityIndicator, useColorScheme, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, isMockMode, db } from '../services/firebase';
import { mockAuth } from '../services/mockAuth';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { seedNabisunsaDatabase } from '../scripts/seed-db';
import { findStudentProfileByRegNo, saveUserProfile } from '../services/db/users';
import { Colors, Spacing } from '../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function LoginScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Tab and student fields
  const [loginTab, setLoginTab] = useState<'student' | 'staff'>('student');
  const [regNumber, setRegNumber] = useState('');
  const [studentName, setStudentName] = useState('');

  const [dbEmpty, setDbEmpty] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState('');

  useEffect(() => {
    if (!isMockMode) {
      const checkDb = async () => {
        try {
          const configRef = doc(db, 'schools', 'nabisunsa_girls');
          const snap = await getDoc(configRef);
          if (!snap.exists()) {
            setDbEmpty(true);
          }
        } catch (e) {
          setDbEmpty(true);
        }
      };
      checkDb();
    }
  }, []);

  const handleInitialSeed = async () => {
    if (seeding) return;
    setSeeding(true);
    setSeedResult('Writing A-level combinations, cutoffs, courses, and mock auth credentials...');
    try {
      const res = await seedNabisunsaDatabase();
      if (res.success) {
        setDbEmpty(false);
        setSeedResult('Database successfully populated! You can now log in using the credentials chips below.');
        if (Platform.OS === 'web') {
          alert('Database Seeding Successful! Live credentials seeded.');
        } else {
          Alert.alert('Database Seeded', 'Your live Firebase Firestore & Auth directories are successfully populated! You can now sign in using the Quick Fill profiles.', [{ text: 'Great!' }]);
        }
      } else {
        setSeedResult(`Seeding failed: ${res.message}`);
      }
    } catch (e: any) {
      console.error('Manual seed error:', e);
      setSeedResult(`Error seeding database: ${e.message || e}`);
    } finally {
      setSeeding(false);
    }
  };

  const [devTapCount, setDevTapCount] = useState(0);

  const handleCrestTap = () => {
    const nextCount = devTapCount + 1;
    if (nextCount >= 5) {
      setDevTapCount(0);
      if (Platform.OS === 'web') {
        const confirmSeed = window.confirm('Developer Utilities: Would you like to seed your Firebase Firestore and Auth directories now?');
        if (confirmSeed) {
          setDbEmpty(true);
          handleInitialSeed();
        }
      } else {
        Alert.alert(
          'Developer Utilities',
          'Would you like to seed your Firebase Firestore and Authentication directories now?',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes, Seed Live DB', onPress: () => {
              setDbEmpty(true);
              handleInitialSeed();
            }}
          ]
        );
      }
    } else {
      setDevTapCount(nextCount);
      // Reset count if no taps within 2.5 seconds
      setTimeout(() => setDevTapCount(0), 2500);
    }
  };

  // Handles normal email/password or student registration number authentication
  const handleLogin = async () => {
    setErrorMessage('');
    
    if (loginTab === 'student') {
      if (!regNumber || !studentName) {
        setErrorMessage('Please fill in Registration Number and Student Name.');
        return;
      }

      setLoading(true);
      try {
        // 1. Search Firestore or Mock Storage for student profile by Reg No
        const profile = await findStudentProfileByRegNo(regNumber);
        if (!profile) {
          setErrorMessage('Student with this Registration Number was not found.');
          setLoading(false);
          return;
        }

        // 2. Validate Student Name (case-insensitive substring match)
        const inputName = studentName.trim().toLowerCase();
        const storedName = profile.displayName.toLowerCase();
        if (!storedName.includes(inputName)) {
          setErrorMessage('Student name does not match our records for this registration number.');
          setLoading(false);
          return;
        }

        // 3. Authenticate silently using virtual email and default password
        const virtualEmail = profile.email || `${regNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}@nabisunsa.ac.ug`;
        const defaultPassword = 'nabisunsa123';

        if (isMockMode) {
          await mockAuth.signIn(virtualEmail, defaultPassword);
        } else {
          try {
            // Attempt standard Firebase Auth sign in
            await signInWithEmailAndPassword(auth, virtualEmail, defaultPassword);
          } catch (authError: any) {
            // Self-healing flow: if the account does not exist in Firebase Auth yet, silently register it
            if (authError.code === 'auth/user-not-found') {
              console.log('[Auth Self-Heal] Creating Firebase Auth account for student...');
              const authUser = await createUserWithEmailAndPassword(auth, virtualEmail, defaultPassword);
              const newUid = authUser.user.uid;

              console.log('[Auth Self-Heal] Mapping Firestore student profile to new UID:', newUid);
              // Save profile under the new Auth UID
              const updatedProfile = {
                ...profile,
                uid: newUid,
                email: virtualEmail,
                updatedAt: new Date() as any
              };
              await saveUserProfile(newUid, updatedProfile);

              // Delete old temp Firestore document if it's different from the new UID
              if (profile.uid && profile.uid !== newUid) {
                try {
                  const oldDocRef = doc(db, 'users', profile.uid);
                  await deleteDoc(oldDocRef);
                  console.log('[Auth Self-Heal] Cleaned up temporary document:', profile.uid);
                } catch (delErr) {
                  console.error('[Auth Self-Heal] Non-critical error deleting temp document:', delErr);
                }
              }
            } else {
              throw authError;
            }
          }
        }
        // Navigation is handled automatically by RootLayout tab listener!
      } catch (error: any) {
        console.error('Student Login Error:', error);
        setErrorMessage(`Login failed: ${error.message || error}`);
      } finally {
        setLoading(false);
      }

    } else {
      // Staff Email/Password Login
      if (!email || !password) {
        setErrorMessage('Please fill in all credential fields.');
        return;
      }

      setLoading(true);
      try {
        if (isMockMode) {
          await mockAuth.signIn(email, password);
        } else {
          await signInWithEmailAndPassword(auth, email.trim(), password);
        }
      } catch (error: any) {
        console.error('Staff Authentication Error:', error);
        let msg = 'Authentication failed. Please check your credentials.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
          msg = 'Invalid email or password combination.';
          const isMockEmail = ['developer@nabisunsa.ac.ug', 'teacher@nabisunsa.ac.ug', 'student@nabisunsa.ac.ug'].includes(email.trim().toLowerCase());
          if (isMockEmail && error.code === 'auth/user-not-found') {
            setDbEmpty(true);
            setSeedResult('This mock account was not found in your Firebase Auth directory. Click the "Seed Live Firebase Database" button below to register it.');
          }
        } else if (error.code === 'auth/invalid-email') {
          msg = 'Please input a valid email address.';
        } else if (error.code === 'auth/api-key-not-valid') {
          msg = 'Firebase API Key is invalid. If you just updated your .env, run "npm start -c" to clear Metro cache.';
        }
        setErrorMessage(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  // Quick-fill credentials for streamlined testing
  const fillQuickCredentials = (fillEmail: string) => {
    if (fillEmail === 'student@nabisunsa.ac.ug') {
      setLoginTab('student');
      setRegNumber('NGSS/2025/002');
      setStudentName('Nakato Sarah');
    } else {
      setLoginTab('staff');
      setEmail(fillEmail);
      setPassword('nabisunsa123'); // Preset password in mock data seed
    }
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        
        {/* Elite Portal Header */}
        <View style={styles.headerSection}>
          <TouchableOpacity 
            activeOpacity={0.8}
            onPress={handleCrestTap}
            style={[styles.crestPlaceholder, { borderColor: colors.gold, backgroundColor: colors.backgroundElement }]}
          >
            <FontAwesome5 name="university" size={32} color={colors.gold} />
          </TouchableOpacity>
          <Text style={[styles.mainTitle, { color: colors.text }]}>
            NABISUNSA GIRLS' SECONDARY SCHOOL
          </Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            Official Academic Information & Learning Portal
          </Text>
        </View>

        {/* Empty Database Setup Banner */}
        {dbEmpty && (
          <View style={[styles.seedBanner, { backgroundColor: colors.gold + '1A', borderColor: colors.gold }]}>
            <FontAwesome5 name="exclamation-triangle" size={20} color={colors.gold} style={styles.seedBannerIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.seedBannerTitle, { color: colors.text }]}>
                Live Database Configuration Needed
              </Text>
              <Text style={[styles.seedBannerDesc, { color: colors.textSecondary }]}>
                Your live Firebase Firestore has connected successfully, but it contains no subjects, combinations, or mock accounts. Tap below to automatically seed the database in one click!
              </Text>
              {seedResult ? (
                <Text style={[styles.seedBannerResult, { color: colors.gold }]}>
                  {seedResult}
                </Text>
              ) : null}
              <TouchableOpacity
                style={[styles.seedBannerBtn, { backgroundColor: colors.primary }]}
                onPress={handleInitialSeed}
                disabled={seeding}
              >
                {seeding ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.seedBannerBtnText}>Seed Live Firebase Database</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Corporate Login Box */}
        <View style={[styles.loginCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
          <Text style={[styles.cardTitle, { color: colors.text, marginBottom: Spacing.three }]}>
            Sign In to Portal
          </Text>

          {/* Segmented Tab */}
          <View style={[styles.tabContainer, { borderColor: colors.gold + '30', backgroundColor: colors.background }]}>
            <TouchableOpacity 
              style={[styles.tabButton, loginTab === 'student' && { backgroundColor: colors.primary }]}
              onPress={() => {
                setLoginTab('student');
                setErrorMessage('');
              }}
            >
              <Text style={[styles.tabButtonText, { color: colors.textSecondary }, loginTab === 'student' && { color: '#FFFFFF', fontWeight: '700' }]}>
                Student / Parent
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabButton, loginTab === 'staff' && { backgroundColor: colors.primary }]}
              onPress={() => {
                setLoginTab('staff');
                setErrorMessage('');
              }}
            >
              <Text style={[styles.tabButtonText, { color: colors.textSecondary }, loginTab === 'staff' && { color: '#FFFFFF', fontWeight: '700' }]}>
                School Staff
              </Text>
            </TouchableOpacity>
          </View>

          {errorMessage ? (
            <View style={[styles.errorBox, { backgroundColor: colors.error + '1A', borderColor: colors.error }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
              
              {/* Dynamic Developer Environment Diagnostics */}
              {loginTab === 'staff' && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: colors.error + '40' }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 2 }}>
                    🔧 Live Connection Diagnostics:
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                    • API Key: {process.env.EXPO_PUBLIC_FIREBASE_API_KEY ? `${process.env.EXPO_PUBLIC_FIREBASE_API_KEY.substring(0, 8)}...${process.env.EXPO_PUBLIC_FIREBASE_API_KEY.substring(process.env.EXPO_PUBLIC_FIREBASE_API_KEY.length - 4)}` : 'undefined'}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                    • Project ID: {process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'undefined'}
                  </Text>
                  <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                    • Mode: {isMockMode ? 'Offline Sandbox (Mock)' : 'Live Firebase'}
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* Conditional inputs */}
          {loginTab === 'student' ? (
            <>
              {/* Registration Number input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Student Registration Number</Text>
                <View style={[styles.inputWrapper, { borderColor: colors.gold, backgroundColor: colors.background }]}>
                  <FontAwesome5 name="id-card" size={14} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. NGSS/2025/002"
                    placeholderTextColor={colors.textSecondary + '80'}
                    value={regNumber}
                    onChangeText={setRegNumber}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Student Name input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Student Full Name</Text>
                <View style={[styles.inputWrapper, { borderColor: colors.gold, backgroundColor: colors.background }]}>
                  <FontAwesome5 name="user" size={14} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="e.g. Nakato Sarah"
                    placeholderTextColor={colors.textSecondary + '80'}
                    value={studentName}
                    onChangeText={setStudentName}
                    autoCorrect={false}
                  />
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Email input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Email Address</Text>
                <View style={[styles.inputWrapper, { borderColor: colors.gold, backgroundColor: colors.background }]}>
                  <FontAwesome5 name="envelope" size={14} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Enter email e.g. teacher@nabisunsa.ac.ug"
                    placeholderTextColor={colors.textSecondary + '80'}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password input */}
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.text }]}>Security Password</Text>
                <View style={[styles.inputWrapper, { borderColor: colors.gold, backgroundColor: colors.background }]}>
                  <FontAwesome5 name="lock" size={14} color={colors.textSecondary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Enter password"
                    placeholderTextColor={colors.textSecondary + '80'}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={secureText}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeBtn}>
                    <FontAwesome5 name={secureText ? 'eye-slash' : 'eye'} size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}

          {/* Login Action */}
          <TouchableOpacity 
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginBtnText}>
                {loginTab === 'student' ? 'Access Student Dashboard' : 'Staff Login'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Testing Profiles (Prestige addition for seamless code validation) */}
        <View style={[styles.testingBox, { backgroundColor: colors.backgroundElement }]}>
          <Text style={[styles.testingTitle, { color: colors.gold }]}>
            Developer Testing Profiles (Quick Fill)
          </Text>
          <View style={styles.chipsContainer}>
            <TouchableOpacity 
              style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.gold }]}
              onPress={() => fillQuickCredentials('developer@nabisunsa.ac.ug')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Super Developer</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.gold }]}
              onPress={() => fillQuickCredentials('teacher@nabisunsa.ac.ug')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Teacher (James)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.chip, { backgroundColor: colors.background, borderColor: colors.gold }]}
              onPress={() => fillQuickCredentials('student@nabisunsa.ac.ug')}
            >
              <Text style={[styles.chipText, { color: colors.text }]}>Student & Parent</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.testingNote, { color: colors.textSecondary }]}>
            Note: All quick profiles use password <Text style={{ fontWeight: 'bold' }}>nabisunsa123</Text> once database is seeded.
          </Text>
          <TouchableOpacity 
            style={{ marginTop: Spacing.two }}
            onPress={() => {
              setDbEmpty(true);
              setSeedResult('Ready to seed. Tap "Seed Live Firebase Database" above.');
            }}
          >
            <Text style={{ fontSize: 11, color: colors.gold, textDecorationLine: 'underline', fontWeight: '600' }}>
              Database already seeded? Tap here to Force Reseed / Register Auth Accounts
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          Authorized Access Only. Powered by Firebase Identity Shield.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  crestPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  mainTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  subTitle: {
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    marginBottom: Spacing.five,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.four,
    letterSpacing: 0.5,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.one,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 48,
    paddingHorizontal: Spacing.two,
  },
  inputIcon: {
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  eyeBtn: {
    padding: Spacing.two,
  },
  loginBtn: {
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
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  testingBox: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  testingTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.two,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  testingNote: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  seedBanner: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    flexDirection: 'row',
    marginBottom: Spacing.four,
  },
  seedBannerIcon: {
    marginRight: Spacing.three,
    marginTop: 2,
  },
  seedBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  seedBannerDesc: {
    fontSize: 11,
    lineHeight: 16,
    marginBottom: Spacing.two,
  },
  seedBannerResult: {
    fontSize: 10,
    fontStyle: 'italic',
    marginBottom: Spacing.two,
  },
  seedBannerBtn: {
    height: 36,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  seedBannerBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 3,
    marginBottom: Spacing.four,
    width: '100%',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonText: {
    fontSize: 12,
  },
});
