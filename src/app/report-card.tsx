/**
 * The full report card for one child and one term.
 *
 * Everything comes from `term_results` on the server, which by construction
 * only ever holds marks the school has released — so a card here can never
 * show a mark the school has not published, and the app has no filter to
 * forget.
 *
 * A parent can look at an earlier term as well as this one, because "is she
 * improving" is the question behind most of these visits.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { Colors, MaxContentWidth, Spacing } from '../constants/theme';
import { useSession } from '../services/session';
import { getResults, type ResultsPayload } from '../services/api';

export default function ReportCardScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { profile, activeChild } = useSession();

  const [termId, setTermId] = useState<number | undefined>(undefined);
  const [payload, setPayload] = useState<ResultsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeChild) return;
    setLoading(true);
    setError('');
    try {
      setPayload(await getResults({ studentId: activeChild.id, termId }));
    } catch (e: any) {
      setError(e?.message || 'Could not load the report card.');
    } finally {
      setLoading(false);
    }
  }, [activeChild, termId]);

  useEffect(() => {
    load();
  }, [load]);

  const released = payload?.results.filter((r) => r.finalScore != null) ?? [];
  const average =
    released.length > 0
      ? released.reduce((sum, r) => sum + (r.finalScore ?? 0), 0) / released.length
      : null;

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <View style={styles.inner}>
        <TouchableOpacity testID="back" onPress={() => router.back()} style={styles.back}>
          <FontAwesome5 name="chevron-left" size={13} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>Back</Text>
        </TouchableOpacity>

        <View
          testID="report-card-screen"
          style={[
            styles.card,
            { backgroundColor: colors.backgroundElement, borderColor: colors.gold },
          ]}
        >
          <Text style={[styles.school, { color: colors.text }]}>
            {profile?.school?.name?.toUpperCase() ?? ''}
          </Text>
          {profile?.school?.motto ? (
            <Text style={[styles.motto, { color: colors.textSecondary }]}>
              {profile.school.motto}
            </Text>
          ) : null}
          <View style={[styles.rule, { backgroundColor: colors.gold }]} />

          <Text style={[styles.student, { color: colors.text }]}>
            {activeChild ? `${activeChild.firstName} ${activeChild.lastName}` : ''}
          </Text>
          <Text style={[styles.studentSub, { color: colors.textSecondary }]}>
            {activeChild?.className}
            {activeChild?.streamName ? ` ${activeChild.streamName}` : ''} ·{' '}
            {activeChild?.registrationNo}
          </Text>

          {/* Terms, so a parent can compare with the last one. */}
          {(payload?.terms?.length ?? 0) > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.termRow}>
              {payload?.terms.map((term) => {
                const active = term.id === payload.term?.id;
                return (
                  <TouchableOpacity
                    key={term.id}
                    onPress={() => setTermId(term.id)}
                    style={[
                      styles.termChip,
                      {
                        borderColor: active ? colors.gold : colors.textSecondary + '40',
                        backgroundColor: active ? colors.champagne : 'transparent',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.termChipText,
                        { color: active ? colors.text : colors.textSecondary },
                      ]}
                    >
                      {term.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {loading ? (
            <ActivityIndicator color={colors.gold} style={{ marginVertical: Spacing.five }} />
          ) : error ? (
            <Text style={[styles.empty, { color: colors.error }]}>{error}</Text>
          ) : released.length === 0 ? (
            // An honest empty card, not a missing one: a parent must be able
            // to tell "nothing released yet" from "the app is broken".
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              No results have been released for {payload?.term?.name ?? 'this term'} yet.
            </Text>
          ) : (
            <>
              <View style={styles.tableHead}>
                <Text style={[styles.thSubject, { color: colors.textSecondary }]}>Subject</Text>
                <Text style={[styles.thNum, { color: colors.textSecondary }]}>C/W</Text>
                <Text style={[styles.thNum, { color: colors.textSecondary }]}>Exam</Text>
                <Text style={[styles.thNum, { color: colors.textSecondary }]}>Final</Text>
                <Text style={[styles.thGrade, { color: colors.textSecondary }]}>Grade</Text>
              </View>

              {released.map((row) => (
                <View
                  key={row.subjectId}
                  style={[styles.tr, { borderTopColor: colors.textSecondary + '20' }]}
                >
                  <View style={styles.tdSubject}>
                    <Text style={[styles.subjectName, { color: colors.text }]}>
                      {row.subjectName}
                    </Text>
                    {row.position != null && (
                      <Text style={[styles.subjectSub, { color: colors.textSecondary }]}>
                        Position {row.position} of {row.groupSize}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.tdNum, { color: colors.textSecondary }]}>
                    {row.caScore ?? '—'}
                  </Text>
                  <Text style={[styles.tdNum, { color: colors.textSecondary }]}>
                    {row.eotScore ?? '—'}
                  </Text>
                  <Text style={[styles.tdNum, styles.strong, { color: colors.text }]}>
                    {row.finalScore}
                  </Text>
                  <Text style={[styles.tdGrade, { color: colors.text }]}>{row.grade ?? '—'}</Text>
                </View>
              ))}

              <View style={[styles.totalRow, { borderTopColor: colors.gold }]}>
                <Text style={[styles.totalLabel, { color: colors.text }]}>Average</Text>
                <Text style={[styles.totalValue, { color: colors.text }]}>
                  {average?.toFixed(1)}
                </Text>
              </View>
            </>
          )}
        </View>

        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          This is what the school has released so far. A printed report card
          signed by the school remains the official record.
        </Text>
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
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing.three },
  backText: { fontSize: 14, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.four },
  school: { fontSize: 14, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center' },
  motto: { fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 2 },
  rule: { height: 1.5, width: 70, alignSelf: 'center', marginVertical: Spacing.three },
  student: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  studentSub: { fontSize: 12, textAlign: 'center', marginTop: 2 },
  termRow: { marginTop: Spacing.three, marginBottom: Spacing.two },
  termChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: Spacing.three,
    marginRight: Spacing.two,
  },
  termChipText: { fontSize: 12, fontWeight: '600' },
  tableHead: { flexDirection: 'row', marginTop: Spacing.three, paddingBottom: Spacing.one },
  thSubject: { flex: 1, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  thNum: { width: 42, fontSize: 10, textAlign: 'right', textTransform: 'uppercase' },
  thGrade: { width: 46, fontSize: 10, textAlign: 'right', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.two, borderTopWidth: 1 },
  tdSubject: { flex: 1, paddingRight: Spacing.two },
  subjectName: { fontSize: 14, fontWeight: '600' },
  subjectSub: { fontSize: 11, marginTop: 2 },
  tdNum: { width: 42, fontSize: 13, textAlign: 'right' },
  tdGrade: { width: 46, fontSize: 14, fontWeight: '800', textAlign: 'right' },
  strong: { fontWeight: '700' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1.5,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
  },
  totalLabel: { fontSize: 14, fontWeight: '700' },
  totalValue: { fontSize: 18, fontWeight: '800' },
  empty: { fontSize: 13, textAlign: 'center', marginVertical: Spacing.five, lineHeight: 20 },
  footnote: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
    lineHeight: 16,
  },
});
