/**
 * What a parent sees when she opens the app.
 *
 * This screen replaces a 2,256-line one that switched between a student, a
 * teacher and an administrator view, and carried a hall of fame of invented
 * students with invented praise. Teachers and administrators work in the web
 * portal now, and nothing here is invented: every number comes from marks
 * the school has released.
 *
 * The shape of the screen follows what a parent actually opens it for —
 * "how is she doing" — so that answer is at the top, in one number, before
 * any navigation.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Colors, MaxContentWidth, Spacing } from '../../constants/theme';
import { useSession } from '../../services/session';
import { getResults, type ResultsPayload } from '../../services/api';

export default function Dashboard() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { profile, activeChild, selectChild, stale, signOut } = useSession();

  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeChild) return;
    setError('');
    try {
      setResults(await getResults({ studentId: activeChild.id }));
    } catch (e: any) {
      setError(e?.message || 'Could not load results.');
    }
  }, [activeChild]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const released = results?.results.filter((r) => r.finalScore != null) ?? [];
  const average =
    released.length > 0
      ? released.reduce((sum, r) => sum + (r.finalScore ?? 0), 0) / released.length
      : null;

  const children = profile?.children ?? [];

  return (
    <ScrollView
      contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />
      }
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <View style={styles.inner}>
        {/* Who this is, and whose marks these are. */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.school, { color: colors.textSecondary }]}>
              {profile?.school?.name ?? ''}
            </Text>
            <Text style={[styles.greeting, { color: colors.text }]}>
              {profile?.user?.name ?? ''}
            </Text>
          </View>
          <TouchableOpacity onPress={signOut} style={styles.signOut}>
            <FontAwesome5 name="sign-out-alt" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {stale && (
          <View style={[styles.banner, { backgroundColor: colors.champagne }]}>
            <Text style={[styles.bannerText, { color: colors.text }]}>
              Showing what was saved on this phone — no connection.
            </Text>
          </View>
        )}

        {/* A parent with two daughters chooses between them. One child needs
            no picker, so it is not shown. */}
        {children.length > 1 && (
          <View style={styles.childRow}>
            {children.map((child) => {
              const active = child.id === activeChild?.id;
              return (
                <TouchableOpacity
                  key={child.id}
                  testID={`child-${child.id}`}
                  onPress={() => selectChild(child.id)}
                  style={[
                    styles.childChip,
                    {
                      borderColor: active ? colors.gold : colors.textSecondary + '40',
                      backgroundColor: active ? colors.champagne : 'transparent',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.childChipText,
                      { color: active ? colors.text : colors.textSecondary },
                    ]}
                  >
                    {child.firstName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {activeChild && (
          <Text style={[styles.childLine, { color: colors.textSecondary }]}>
            {activeChild.firstName} {activeChild.lastName} · {activeChild.className}
            {activeChild.streamName ? ` ${activeChild.streamName}` : ''} ·{' '}
            {activeChild.registrationNo}
          </Text>
        )}

        {loading ? (
          <ActivityIndicator size="large" color={colors.gold} style={{ marginTop: Spacing.six }} />
        ) : (
          <>
            {error ? (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
                <TouchableOpacity onPress={onRefresh}>
                  <Text style={[styles.link, { color: colors.primary }]}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* The answer to the question the app is opened for. */}
            <View
              style={[
                styles.summary,
                { backgroundColor: colors.backgroundElement, borderColor: colors.gold },
              ]}
            >
              <Text style={[styles.summaryTerm, { color: colors.textSecondary }]}>
                {results?.term?.name ?? 'No term yet'}
              </Text>
              {average == null ? (
                <>
                  <Text style={[styles.summaryEmpty, { color: colors.text }]}>
                    No marks released yet
                  </Text>
                  <Text style={[styles.summaryHint, { color: colors.textSecondary }]}>
                    Results appear here as the school releases each subject.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.summaryScore, { color: colors.text }]}>
                    {average.toFixed(1)}
                    <Text style={[styles.summaryUnit, { color: colors.textSecondary }]}>
                      {' '}average
                    </Text>
                  </Text>
                  <Text style={[styles.summaryHint, { color: colors.textSecondary }]}>
                    Across {released.length} subject{released.length === 1 ? '' : 's'} released
                    so far this term
                  </Text>
                </>
              )}
            </View>

            {/* Subjects, plainly. No charts: a mark, a grade, a position. */}
            {released.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>Subjects</Text>
                {released.map((subject) => (
                  <View key={subject.subjectId} style={styles.subjectRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subjectName, { color: colors.text }]}>
                        {subject.subjectName}
                      </Text>
                      {subject.position != null && (
                        <Text style={[styles.subjectSub, { color: colors.textSecondary }]}>
                          Position {subject.position} of {subject.groupSize}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.subjectScore, { color: colors.text }]}>
                      {subject.finalScore}
                    </Text>
                    <View style={[styles.gradePill, { backgroundColor: colors.champagne }]}>
                      <Text style={[styles.gradeText, { color: colors.text }]}>
                        {subject.grade ?? '—'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Two things to do next, not twelve. */}
            <TouchableOpacity
              testID="report-card"
              style={[styles.action, { backgroundColor: colors.primary }]}
              onPress={() => router.push('/report-card')}
            >
              <FontAwesome5 name="file-alt" size={16} color="#FFFFFF" />
              <Text style={styles.actionText}>Full report card</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="advisor"
              style={[styles.actionOutline, { borderColor: colors.gold }]}
              onPress={() => router.push('/ai-chat')}
            >
              <FontAwesome5 name="comments" size={16} color={colors.gold} />
              <Text style={[styles.actionOutlineText, { color: colors.text }]}>
                Ask about her progress
              </Text>
            </TouchableOpacity>

            <Text style={[styles.footnote, { color: colors.textSecondary }]}>
              Only marks the school has released appear here.
            </Text>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  inner: { width: '100%', maxWidth: MaxContentWidth },
  header: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: Spacing.three },
  school: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  greeting: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  signOut: { padding: Spacing.two },
  banner: { borderRadius: Spacing.two, padding: Spacing.two, marginBottom: Spacing.three },
  bannerText: { fontSize: 12 },
  childRow: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.two },
  childChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
  },
  childChipText: { fontSize: 13, fontWeight: '700' },
  childLine: { fontSize: 12, marginBottom: Spacing.three },
  summary: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginBottom: Spacing.three,
  },
  summaryTerm: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase' },
  summaryScore: { fontSize: 40, fontWeight: '800', marginTop: Spacing.one },
  summaryUnit: { fontSize: 14, fontWeight: '600' },
  summaryEmpty: { fontSize: 20, fontWeight: '700', marginTop: Spacing.one },
  summaryHint: { fontSize: 12, marginTop: Spacing.one, lineHeight: 18 },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: Spacing.two },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  subjectName: { fontSize: 14, fontWeight: '600' },
  subjectSub: { fontSize: 11, marginTop: 2 },
  subjectScore: { fontSize: 16, fontWeight: '700', minWidth: 34, textAlign: 'right' },
  gradePill: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10, minWidth: 34 },
  gradeText: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 50,
    borderRadius: Spacing.two,
    marginBottom: Spacing.two,
  },
  actionText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  actionOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 50,
    borderWidth: 1,
    borderRadius: Spacing.two,
    marginBottom: Spacing.three,
  },
  actionOutlineText: { fontSize: 14, fontWeight: '700' },
  errorText: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.one },
  link: { fontSize: 13, fontWeight: '700' },
  footnote: { fontSize: 11, textAlign: 'center', marginBottom: Spacing.four },
});
