import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { auth, db, isMockMode } from '../../services/firebase';
import { getUserProfile } from '../../services/db/users';
import { Lesson, Subject } from '../../types';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { getLessons } from '../../services/db/lessons';

export default function ClassroomScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>('all');

  useEffect(() => {
    async function loadClassroomData() {
      const currentUser = auth.currentUser;
      if (!currentUser) return;

      try {
        const profile = await getUserProfile(currentUser.uid);
        if (profile) {
          // 1. Fetch school subjects registered to student
          let studentSubs: Subject[] = [];
          if (isMockMode) {
            const { DEFAULT_SUBJECTS } = require('../../scripts/seedData');
            studentSubs = (DEFAULT_SUBJECTS as Subject[]).filter((s: Subject) => (profile.subjects || []).includes(s.id));
          } else {
            const subSnap = await getDocs(collection(db, 'subjects'));
            const allSubs = subSnap.docs.map(d => d.data() as Subject);
            studentSubs = allSubs.filter(s => (profile.subjects || []).includes(s.id));
          }
          setSubjects(studentSubs);

          // 2. Fetch mock/real lessons dynamically from service
          const allLessons = await getLessons(profile.schoolId || 'nabisunsa_girls');
          setLessons(allLessons.filter(l => (profile.subjects || []).includes(l.subjectId)));
        }
      } catch (e) {
        console.error('Error loading classroom:', e);
      } finally {
        setLoading(false);
      }
    }

    loadClassroomData();
  }, []);

  const anyDate = () => {
    return { toDate: () => new Date() } as any;
  };

  const filteredLessons = activeSubject === 'all' 
    ? lessons 
    : lessons.filter(l => l.subjectId === activeSubject);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header Bar */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Academic Classroom</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Watch video lessons and read attached study notes uploaded by your teachers.
        </Text>
      </View>

      {/* Subjects Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterBar}>
        <TouchableOpacity
          style={[
            styles.filterChip, 
            { backgroundColor: activeSubject === 'all' ? colors.primary : colors.backgroundElement, borderColor: colors.gold }
          ]}
          onPress={() => setActiveSubject('all')}
        >
          <Text style={[styles.filterText, { color: activeSubject === 'all' ? '#FFFFFF' : colors.text }]}>All Subjects</Text>
        </TouchableOpacity>

        {subjects.map((sub) => (
          <TouchableOpacity
            key={sub.id}
            style={[
              styles.filterChip, 
              { backgroundColor: activeSubject === sub.id ? colors.primary : colors.backgroundElement, borderColor: colors.gold }
            ]}
            onPress={() => setActiveSubject(sub.id)}
          >
            <Text style={[styles.filterText, { color: activeSubject === sub.id ? '#FFFFFF' : colors.text }]}>{sub.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Lessons List Grid */}
      <View style={styles.lessonsSection}>
        {filteredLessons.length > 0 ? (
          filteredLessons.map((lesson) => (
            <TouchableOpacity
              key={lesson.id}
              style={[styles.lessonCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}
              onPress={() => router.push(`/lessons/${lesson.id}`)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.iconShield, { backgroundColor: colors.champagne }]}>
                  <FontAwesome5 name="video" size={12} color={colors.gold} />
                </View>
                <View style={{ flex: 1, marginLeft: Spacing.two }}>
                  <Text style={[styles.subjectLabel, { color: colors.gold }]}>
                    {lesson.subjectId.replace('a_', '').replace('o_', '').toUpperCase()} • {lesson.topic}
                  </Text>
                  <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
                </View>
              </View>

              <Text style={[styles.notesTag, { color: colors.textSecondary }]}>
                <FontAwesome5 name="file-pdf" size={10} color={colors.gold} style={{ marginRight: 6 }} /> Includes PDF Study Notes
              </Text>

              <View style={styles.cardFooter}>
                <Text style={[styles.commentsCount, { color: colors.textSecondary }]}>
                  <FontAwesome5 name="comment" size={10} color={colors.textSecondary} style={{ marginRight: 4 }} /> {lesson.commentCount} Comments
                </Text>
                <View style={styles.actionRow}>
                  <Text style={[styles.playText, { color: colors.primary }]}>Stream Lesson</Text>
                  <FontAwesome5 name="play" size={8} color={colors.primary} style={{ marginLeft: 6 }} />
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={styles.emptyBox}>
            <FontAwesome5 name="folder-open" size={32} color={colors.gold} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: colors.text }]}>No video lessons available</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              There are no lessons uploaded for the selected subject category yet.
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Platform.OS === 'ios' ? 60 : 30,
    paddingBottom: Spacing.five,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  filterBar: {
    paddingVertical: Spacing.one,
    marginBottom: Spacing.four,
    gap: Spacing.two,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: Spacing.three,
    marginRight: 6,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  lessonsSection: {
    gap: Spacing.three,
  },
  lessonCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  iconShield: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  lessonTitle: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 2,
    lineHeight: 18,
  },
  notesTag: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: Spacing.two,
    paddingLeft: Spacing.two,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#0F20420F',
    paddingTop: Spacing.two,
    marginTop: Spacing.one,
  },
  commentsCount: {
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 11,
    textAlign: 'center',
  },
});
