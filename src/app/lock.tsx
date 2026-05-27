import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';
import { SchoolConfig } from '../types';
import { Colors, Spacing } from '../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function LockScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [schoolConfig, setSchoolConfig] = useState<SchoolConfig | null>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to school config in real-time to release locks instantly if reactivated
  useEffect(() => {
    const schoolRef = doc(db, 'schools', 'nabisunsa_girls');
    const unsubscribe = onSnapshot(schoolRef, (snap) => {
      if (snap.exists()) {
        const config = snap.data() as SchoolConfig;
        setSchoolConfig(config);
        // If reactivated, let the root layout handle the redirect
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const disabledReason = schoolConfig?.disabledReason || 'System subscription renewal is currently pending.';

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      
      {/* Premium Branded Frame */}
      <View style={[styles.lockCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        {/* Elite Icon Shield */}
        <View style={[styles.shieldIconContainer, { backgroundColor: colors.champagne }]}>
          <FontAwesome5 name="shield-alt" size={48} color={colors.gold} />
        </View>

        {/* School Crest Header */}
        <Text style={[styles.schoolTitle, { color: colors.text }]}>
          NABISUNSA GIRLS' SECONDARY SCHOOL
        </Text>
        <Text style={[styles.motto, { color: colors.textSecondary }]}>
          "Empowerment Through Education"
        </Text>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.gold }]} />

        {/* Warning Body */}
        <Text style={[styles.lockHeader, { color: colors.error }]}>
          Portal Temporarily Suspended
        </Text>
        
        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {disabledReason}
        </Text>

        <Text style={[styles.contactInfo, { color: colors.text }]}>
          For subscription renewals or immediate assistance, please contact the IT administrative desk at:
        </Text>
        
        <Text style={[styles.emailLink, { color: colors.primary }]}>
          admin@nabisunsagirls.ac.ug
        </Text>

        {/* Backdoor for developers */}
        <TouchableOpacity 
          style={[styles.developerBtn, { borderColor: colors.gold }]}
          onPress={() => router.push('/developer')}
        >
          <Text style={[styles.developerBtnText, { color: colors.gold }]}>
            Developer Console Panel
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.footerText, { color: colors.textSecondary }]}>
        Nabisunsa Portal © {new Date().getFullYear()} — Powered by Developer Super-Admin Controls
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  lockCard: {
    width: '100%',
    maxWidth: 450,
    borderRadius: Spacing.four,
    borderWidth: 1,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  shieldIconContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  schoolTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  motto: {
    fontSize: 12,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.8,
  },
  divider: {
    width: 80,
    height: 1.5,
    marginVertical: Spacing.three,
  },
  lockHeader: {
    fontSize: 20,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: Spacing.four,
    paddingHorizontal: Spacing.two,
  },
  contactInfo: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  emailLink: {
    fontSize: 14,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginBottom: Spacing.five,
  },
  developerBtn: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  developerBtnText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footerText: {
    fontSize: 11,
    marginTop: Spacing.five,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
