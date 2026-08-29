/**
 * The school's portal has been switched off.
 *
 * The reason and the school's name come from the session, which got them
 * from the server. Nothing here decides anything: by the time this screen
 * appears the server is already refusing to serve marks, so a parent who
 * bypassed it would see an empty app rather than someone else's data.
 */

import { StyleSheet, View, Text, TouchableOpacity, useColorScheme } from 'react-native';
import { Colors, Spacing } from '../constants/theme';
import { Brand } from '../constants/brand';
import { useSession } from '../services/session';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

export default function LockScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { profile, lockReason, signOut } = useSession();

  const schoolName = profile?.school?.name || Brand.name;
  const motto = profile?.school?.motto || Brand.motto;
  const disabledReason =
    lockReason || 'The school\u2019s subscription renewal is currently pending.';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <View style={[styles.lockCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <View style={[styles.shieldIconContainer, { backgroundColor: colors.champagne }]}>
          <FontAwesome5 name="shield-alt" size={48} color={colors.gold} />
        </View>

        <Text style={[styles.schoolTitle, { color: colors.text }]}>
          {schoolName.toUpperCase()}
        </Text>
        {motto ? (
          <Text style={[styles.motto, { color: colors.textSecondary }]}>{motto}</Text>
        ) : null}

        <View style={[styles.divider, { backgroundColor: colors.gold }]} />

        <Text style={[styles.lockHeader, { color: colors.error }]}>
          Portal Temporarily Suspended
        </Text>

        <Text style={[styles.description, { color: colors.textSecondary }]}>
          {disabledReason}
        </Text>

        <Text style={[styles.contactInfo, { color: colors.text }]}>
          Please contact the school office:
        </Text>

        <Text style={[styles.emailLink, { color: colors.primary }]}>
          {Brand.contactEmail}
        </Text>

        <TouchableOpacity
          style={[styles.developerBtn, { borderColor: colors.gold }]}
          onPress={signOut}
        >
          <Text style={[styles.developerBtnText, { color: colors.gold }]}>Sign out</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.footerText, { color: colors.textSecondary }]}>
        {schoolName} © {new Date().getFullYear()}
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
