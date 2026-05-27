import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, TextInput, Alert, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { toggleSchoolActivation } from '../../services/db/users';
import { SchoolConfig } from '../../types';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { seedNabisunsaDatabase } from '../../scripts/seed-db';

export default function DeveloperConsoleScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [disabledReason, setDisabledReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const configRef = doc(db, 'schools', 'nabisunsa_girls');
        const snap = await getDoc(configRef);
        if (snap.exists()) {
          const config = snap.data() as SchoolConfig;
          setSchoolConfig(config);
          setIsActive(config.isActive);
          setDisabledReason(config.disabledReason || '');
        }
      } catch (e) {
        console.error('Error loading school config:', e);
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  const handleSaveToggle = async () => {
    setSaving(true);
    try {
      await toggleSchoolActivation('nabisunsa_girls', isActive, disabledReason);
      const msg = `Portal lock settings saved successfully! School Active state set to: ${isActive ? 'ACTIVE' : 'LOCKED'}.`;
      if (Platform.OS === 'web') {
        alert(msg);
      } else {
        Alert.alert('Status Saved', msg, [{ text: 'OK' }]);
      }
    } catch (e: any) {
      console.error('Error saving lock settings:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleTriggerSeeding = async () => {
    if (seeding) return;
    setSeeding(true);
    try {
      const result = await seedNabisunsaDatabase();
      if (Platform.OS === 'web') {
        alert(result.message);
      } else {
        Alert.alert('Database Seeder', result.message, [{ text: 'Close Portal' }]);
      }
    } catch (e: any) {
      console.error('Seeding error:', e);
    } finally {
      setSeeding(false);
    }
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
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.replace('/')}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Developer System Control</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Crest Title */}
      <View style={styles.header}>
        <View style={[styles.shieldBg, { backgroundColor: colors.champagne }]}>
          <FontAwesome5 name="cogs" size={28} color={colors.gold} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>NABISUNSA PORTAL CONTROLLER</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Administrative developer console for subscription toggles, school access switches, and direct seeding utilities.
        </Text>
      </View>

      {/* A. Dynamic app-wide access switch */}
      <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Application Status Switch</Text>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
          Enables/Disables the academic portal app-wide. If locked, users are instantly blockaded with the lockout description.
        </Text>

        {/* Toggle Status Row */}
        <View style={styles.toggleRow}>
          <Text style={[styles.toggleLabel, { color: colors.text }]}>
            Portal Active Status:
          </Text>
          <TouchableOpacity 
            style={[
              styles.statusToggleBtn, 
              { backgroundColor: isActive ? colors.success + '1A' : colors.error + '1A', borderColor: isActive ? colors.success : colors.error }
            ]}
            onPress={() => setIsActive(!isActive)}
          >
            <Text style={[styles.statusText, { color: isActive ? colors.success : colors.error }]}>
              {isActive ? 'ACTIVE (Unlocked)' : 'LOCKED (Blockaded)'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* If Locked, provide warning inputs */}
        {!isActive && (
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>Lockout Description (Displays on warning screen):</Text>
            <TextInput
              style={[styles.input, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
              placeholder="e.g. Portal under scheduled maintenance. Back online by 2:00 PM."
              placeholderTextColor={colors.textSecondary + '80'}
              value={disabledReason}
              onChangeText={setDisabledReason}
              multiline
            />
          </View>
        )}

        <TouchableOpacity 
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSaveToggle}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save Portal Lock Settings</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* B. Database Seeder tool */}
      <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>Firestore Seeder Tool</Text>
        <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
          Seeds standard O-Level/A-Level subjects, A-Level combinations, real JAB cutoff degrees database, and mock test profiles (Developer, Admin, Teacher, Student) directly to Firestore.
        </Text>

        <TouchableOpacity 
          style={[styles.seedBtn, { borderColor: colors.gold }]}
          onPress={handleTriggerSeeding}
          disabled={seeding}
        >
          {seeding ? (
            <ActivityIndicator color={colors.gold} size="small" />
          ) : (
            <>
              <FontAwesome5 name="database" size={14} color={colors.gold} style={{ marginRight: 8 }} />
              <Text style={[styles.seedBtnText, { color: colors.gold }]}>Seed Default Ugandan Database</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
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
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  shieldBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.0,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: Spacing.two,
  },
  card: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    shadowOpacity: 0.01,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: Spacing.three,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: Spacing.two,
    backgroundColor: '#0F20420A',
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  statusToggleBtn: {
    borderWidth: 1.5,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    fontSize: 12,
    height: 60,
    textAlignVertical: 'top',
  },
  saveBtn: {
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  seedBtn: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: Spacing.two,
  },
  seedBtnText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
