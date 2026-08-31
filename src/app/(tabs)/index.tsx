/**
 * What a parent sees when she opens the app.
 *
 * She opens it to ask one question — how is my daughter doing — so that
 * answer is the first thing on the screen, in one number, above any
 * navigation. Everything else is arranged beneath it in the order she would
 * ask: which subjects, what the school has said, and then the two things
 * worth doing next.
 *
 * Nothing here is invented. Every number is a mark the school has released.
 */

import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  AppHeader,
  Badge,
  Card,
  Chip,
  Divider,
  Loading,
  Notice,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Space,
  Type,
  usePalette,
} from '../../components/ui';
import { useSession } from '../../services/session';
import {
  getAnnouncements,
  getResults,
  type Announcement,
  type ResultsPayload,
} from '../../services/api';

export default function Dashboard() {
  const router = useRouter();
  const c = usePalette();
  const { profile, activeChild, selectChild, stale, signOut } = useSession();

  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
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
    try {
      setAnnouncements(await getAnnouncements());
    } catch {
      // The marks are the point of this screen. A school notice that failed
      // to load is not worth an error over the top of them.
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
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

      <AppHeader
        school={profile?.school?.name}
        title={profile?.user?.name ?? ''}
        action={{ icon: 'sign-out-alt', onPress: signOut, label: 'Sign out' }}
      />

      {stale && <Notice tone="info">Showing what was saved on this phone — no connection.</Notice>}

      {/* A parent with two daughters chooses between them. One child needs no
          picker, so it is not shown. */}
      {children.length > 1 && (
        <View style={styles.children}>
          {children.map((child) => (
            <Chip
              key={child.id}
              testID={`child-${child.id}`}
              label={child.firstName}
              selected={child.id === activeChild?.id}
              onPress={() => selectChild(child.id)}
            />
          ))}
        </View>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}

          {/* The answer to the question the app is opened for. */}
          <Card accent>
            <Text style={[Type.overline, { color: c.textSecondary }]}>
              {(results?.term?.name ?? 'No term yet').toUpperCase()}
            </Text>

            {average == null ? (
              <>
                <Text style={[Type.title, { color: c.text, marginTop: Space.snug }]}>
                  No marks released yet
                </Text>
                <Text style={[Type.caption, { color: c.textSecondary, marginTop: Space.tight }]}>
                  Results appear here as the school releases each subject.
                </Text>
              </>
            ) : (
              <>
                <View style={styles.scoreRow}>
                  <Text style={[Type.display, { color: c.text }]}>{average.toFixed(1)}</Text>
                  <Text style={[Type.label, { color: c.textSecondary, marginBottom: 7 }]}>
                    average
                  </Text>
                </View>
                <Text style={[Type.caption, { color: c.textSecondary }]}>
                  Across {released.length} subject{released.length === 1 ? '' : 's'} released so
                  far this term
                </Text>
              </>
            )}

            {activeChild && (
              <>
                <View style={{ height: Space.gap }} />
                <Divider />
                <Text style={[Type.caption, { color: c.textSecondary, marginTop: Space.base }]}>
                  {activeChild.firstName} {activeChild.lastName} · {activeChild.className}
                  {activeChild.streamName ? ` ${activeChild.streamName}` : ''} ·{' '}
                  {activeChild.registrationNo}
                </Text>
              </>
            )}
          </Card>

          {/* Subjects, plainly. A mark, a grade, a position — no charts. */}
          {released.length > 0 && (
            <Card title="Subjects">
              {released.map((subject, index) => (
                <View key={subject.subjectId}>
                  {index > 0 && <Divider />}
                  <View style={styles.subject}>
                    <View style={{ flex: 1 }}>
                      <Text style={[Type.body, { color: c.text, fontWeight: '600' }]}>
                        {subject.subjectName}
                      </Text>
                      {subject.position != null && (
                        <Text style={[Type.caption, { color: c.textSecondary }]}>
                          Position {subject.position} of {subject.groupSize}
                        </Text>
                      )}
                    </View>
                    <Text style={[Type.title, { color: c.text, marginRight: Space.base }]}>
                      {subject.finalScore}
                    </Text>
                    <Badge label={subject.grade ?? '—'} />
                  </View>
                </View>
              ))}
            </Card>
          )}

          {announcements.length > 0 && (
            <Card title="From the school">
              {announcements.slice(0, 4).map((note, index) => (
                <View key={note.id}>
                  {index > 0 && <Divider />}
                  <View style={styles.note}>
                    <Text style={[Type.body, { color: c.text, fontWeight: '700' }]}>
                      {note.title}
                    </Text>
                    <Text
                      style={[Type.body, { color: c.textSecondary, marginTop: Space.tight }]}
                    >
                      {note.body}
                    </Text>
                    {note.publishedAt ? (
                      <Text
                        style={[Type.caption, { color: c.textSecondary, marginTop: Space.snug }]}
                      >
                        {new Date(note.publishedAt).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </Card>
          )}

          {/* Two things to do next, not twelve. */}
          <View style={{ marginTop: Space.snug }}>
            <PrimaryButton
              testID="report-card"
              icon="file-alt"
              label="Full report card"
              onPress={() => router.push('/report-card')}
            />
            <SecondaryButton
              testID="advisor"
              icon="comments"
              label="Ask about her progress"
              onPress={() => router.push('/ai-chat')}
            />
          </View>

          <Text style={[Type.caption, styles.footnote, { color: c.textSecondary }]}>
            Only marks the school has released appear here.
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  children: { flexDirection: 'row', gap: Space.snug, marginBottom: Space.gap },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.snug, marginTop: Space.tight },
  subject: { flexDirection: 'row', alignItems: 'center', paddingVertical: Space.base },
  note: { paddingVertical: Space.base },
  footnote: { textAlign: 'center', marginTop: Space.snug },
});
