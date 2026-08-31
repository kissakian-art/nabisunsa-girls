/**
 * The full report card for one child and one term.
 *
 * Laid out like the paper card a parent already knows — school at the top,
 * the student, then a table of subjects and an average — because this is the
 * screen most likely to be shown to a relative, and it has to look like a
 * document rather than an app screen.
 *
 * Everything comes from `term_results` on the server, which by construction
 * holds only marks the school has released. A card here can never show a
 * mark the school has not published.
 */

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Card,
  Chip,
  Divider,
  Loading,
  Notice,
  Screen,
  SecondaryButton,
  Space,
  Type,
  usePalette,
} from '../../components/ui';
import { useSession } from '../../services/session';
import { getResults, type ResultsPayload } from '../../services/api';

export default function ReportCardScreen() {
  const router = useRouter();
  const c = usePalette();
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
    <Screen>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

      <Card testID="report-card-screen" accent style={{ paddingHorizontal: Space.section }}>
        {/* The letterhead. */}
        <View style={styles.letterhead}>
          <Text style={[Type.overline, { color: c.text, textAlign: 'center' }]}>
            {(profile?.school?.name ?? '').toUpperCase()}
          </Text>
          {profile?.school?.motto ? (
            <Text
              style={[
                Type.caption,
                { color: c.textSecondary, fontStyle: 'italic', textAlign: 'center' },
              ]}
            >
              {profile.school.motto}
            </Text>
          ) : null}
          <View style={[styles.rule, { backgroundColor: c.gold }]} />
          <Text style={[Type.title, { color: c.text, textAlign: 'center' }]}>
            {activeChild ? `${activeChild.firstName} ${activeChild.lastName}` : ''}
          </Text>
          <Text style={[Type.caption, { color: c.textSecondary, textAlign: 'center' }]}>
            {activeChild?.className}
            {activeChild?.streamName ? ` ${activeChild.streamName}` : ''} ·{' '}
            {activeChild?.registrationNo}
          </Text>
        </View>

        {/* Terms, so a parent can compare with the last one. */}
        {(payload?.terms?.length ?? 0) > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.terms}
          >
            {payload?.terms.map((term) => (
              <Chip
                key={term.id}
                label={term.name}
                selected={term.id === payload.term?.id}
                onPress={() => setTermId(term.id)}
              />
            ))}
          </ScrollView>
        )}

        {loading ? (
          <Loading />
        ) : error ? (
          <Notice tone="error">{error}</Notice>
        ) : released.length === 0 ? (
          // An honest empty card, not a missing one: a parent must be able to
          // tell "nothing released yet" from "the app is broken".
          <Text style={[Type.body, styles.empty, { color: c.textSecondary }]}>
            No results have been released for {payload?.term?.name ?? 'this term'} yet.
          </Text>
        ) : (
          <>
            <View style={styles.headRow}>
              <Text style={[Type.overline, styles.colSubject, { color: c.textSecondary }]}>
                Subject
              </Text>
              <Text style={[Type.overline, styles.colNum, { color: c.textSecondary }]}>C/W</Text>
              <Text style={[Type.overline, styles.colNum, { color: c.textSecondary }]}>Exam</Text>
              <Text style={[Type.overline, styles.colNum, { color: c.textSecondary }]}>Final</Text>
              <Text style={[Type.overline, styles.colGrade, { color: c.textSecondary }]}>
                Grade
              </Text>
            </View>
            <Divider />

            {released.map((row) => (
              <View key={row.subjectId}>
                <View style={styles.row}>
                  <View style={styles.colSubject}>
                    <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>
                      {row.subjectName}
                    </Text>
                    {row.position != null && (
                      <Text style={[Type.caption, { color: c.textSecondary }]}>
                        Position {row.position} of {row.groupSize}
                      </Text>
                    )}
                  </View>
                  <Text style={[Type.body, styles.colNum, { color: c.textSecondary }]}>
                    {row.caScore ?? '—'}
                  </Text>
                  <Text style={[Type.body, styles.colNum, { color: c.textSecondary }]}>
                    {row.eotScore ?? '—'}
                  </Text>
                  <Text style={[Type.body, styles.colNum, { color: c.text, fontWeight: '700' }]}>
                    {row.finalScore}
                  </Text>
                  <Text style={[Type.heading, styles.colGrade, { color: c.text }]}>
                    {row.grade ?? '—'}
                  </Text>
                </View>
                <Divider />
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={[Type.heading, { color: c.text }]}>Average</Text>
              <Text style={[Type.title, { color: c.text }]}>{average?.toFixed(1)}</Text>
            </View>
          </>
        )}
      </Card>

      <SecondaryButton testID="back" icon="chevron-left" label="Back" onPress={() => router.back()} />

      <Text style={[Type.caption, styles.footnote, { color: c.textSecondary }]}>
        This is what the school has released so far. A printed report card signed by the school
        remains the official record.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  letterhead: { alignItems: 'center', marginBottom: Space.gap },
  rule: { width: 64, height: 2, marginVertical: Space.gap },
  terms: { gap: Space.snug, paddingBottom: Space.gap },
  headRow: { flexDirection: 'row', alignItems: 'flex-end', paddingBottom: Space.snug },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.base },
  colSubject: { flex: 1, paddingRight: Space.snug },
  colNum: { width: 44, textAlign: 'right' },
  colGrade: { width: 48, textAlign: 'right' },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Space.gap,
  },
  empty: { textAlign: 'center', paddingVertical: Space.page, lineHeight: 21 },
  footnote: { textAlign: 'center', marginTop: Space.snug },
});
