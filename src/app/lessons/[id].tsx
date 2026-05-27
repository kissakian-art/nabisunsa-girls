import { useEffect, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, TextInput, Modal, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { auth, db } from '../../services/firebase';
import { getUserProfile } from '../../services/db/users';
import { getLessons } from '../../services/db/lessons';
import { Lesson, LessonComment } from '../../types';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { WebView } from 'react-native-webview';

export default function LessonDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const lessonId = params.id as string;

  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [comments, setComments] = useState<LessonComment[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadPercent, setDownloadPercent] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  // Make the player fill most of the screen width and be tall (roughly 56% of screen height)
  const playerHeight = Math.max(screenHeight * 0.56, 320);

  const getGoogleDriveEmbedUrl = (input: string): string => {
    if (!input) return '';
    const fileIdMatch = input.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = fileIdMatch ? fileIdMatch[1] : input;
    return `https://drive.google.com/file/d/${fileId}/preview`;
  };

  // Injected JS to scale content + hide obtrusive center overlay controls
  const injectedJS = `
    (function() {
      /* ── 1. Full-viewport sizing ── */
      var style = document.createElement('style');
      style.textContent = [
        '* { margin:0; padding:0; box-sizing:border-box; }',
        'body, html { width:100%!important; height:100%!important; overflow:hidden; }',
        'video { width:100%!important; height:100%!important; object-fit:contain; }',
        'iframe { width:100%!important; height:100%!important; }',
      ].join(' ');
      document.head.appendChild(style);

      var meta = document.createElement('meta');
      meta.name = 'viewport';
      meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
      document.head.appendChild(meta);

      /* ── 2. Hide large center overlay controls ── */
      function hideCenterControls() {
        /* Target buttons by aria-label or data-tooltip */
        var selectors = [
          '[aria-label*="ewind"]',
          '[aria-label*="orward"]',
          '[aria-label*="seek"]',
          '[aria-label*="Seek"]',
          '[aria-label*="Replay"]',
          '[aria-label*="replay"]',
          '[data-tooltip*="ewind"]',
          '[data-tooltip*="orward"]',
          '[data-tooltip*="10"]',
          '[data-tooltip*="seek"]',
        ];
        selectors.forEach(function(sel) {
          document.querySelectorAll(sel).forEach(function(el) {
            el.style.setProperty('display','none','important');
          });
        });

        /* Hide the timestamp text (e.g. "0:05 / 10:52") and its container */
        var walker = document.createTreeWalker(
          document.body || document.documentElement,
          NodeFilter.SHOW_TEXT
        );
        while (walker.nextNode()) {
          var t = walker.currentNode.textContent.trim();
          if (/^\\d{1,2}:\\d{2}\\s*\\/\\s*\\d{1,2}:\\d{2}$/.test(t)) {
            var p = walker.currentNode.parentElement;
            if (p) p.style.setProperty('display','none','important');
          }
        }

        /* Find the large center play/pause overlay button —
           it is typically the biggest button sitting over the video.
           We target buttons whose bounding box is > 44px AND
           positioned in the center third of the viewport. */
        var vw = window.innerWidth;
        var vh = window.innerHeight;
        document.querySelectorAll('button, [role="button"]').forEach(function(b) {
          var r = b.getBoundingClientRect();
          if (r.width >= 44 && r.height >= 44 &&
              r.left > vw * 0.05 && r.right < vw * 0.95 &&
              r.top > vh * 0.15 && r.bottom < vh * 0.85) {
            var label = ((b.getAttribute('aria-label')||'')+(b.getAttribute('data-tooltip')||'')).toLowerCase();
            if (label.includes('play') || label.includes('pause') ||
                label.includes('rewind') || label.includes('forward') ||
                label.includes('seek') || label.includes('replay')) {
              b.style.setProperty('display','none','important');
            }
          }
        });
      }

      /* Run on DOM mutations + intervals for the first 15 s */
      var obs = new MutationObserver(hideCenterControls);
      obs.observe(document.documentElement, { childList:true, subtree:true });
      var iv = setInterval(hideCenterControls, 600);
      setTimeout(function(){ clearInterval(iv); }, 15000);
      hideCenterControls();
    })();
    true;
  `;

  useEffect(() => {
    async function loadLessonDetails() {
      if (!lessonId) return;

      try {
        // Fetch all lessons dynamically (Firestore or local storage)
        const allLessons = await getLessons('nabisunsa_girls');
        const lessonData = allLessons.find(l => l.id === lessonId);

        if (lessonData) {
          setLesson(lessonData);
        } else {
          // Fallback to static mock structure if not found in db query
          const mockLessonsList: Record<string, Lesson> = {
            lesson_math_1: {
              id: 'lesson_math_1',
              teacherId: 'teacher_uid',
              subjectId: 'a_mathematics',
              classId: 'S5',
              termId: '2026_term1',
              topic: 'Calculus & Integration',
              title: 'Introduction to First Principles',
              googleDriveId: '12345ABCDE_gdrive_id',
              pdfAttachmentUrl: 'Calculus_First_Principles_Notes.pdf',
              commentCount: 2,
              createdAt: Timestamp.now()
            },
            lesson_phys_1: {
              id: 'lesson_phys_1',
              teacherId: 'teacher_uid',
              subjectId: 'a_physics',
              classId: 'S5',
              termId: '2026_term1',
              topic: 'Mechanics & Motion',
              title: 'Understanding Newton\'s Second Law',
              googleDriveId: '67890XYZ_gdrive_id',
              pdfAttachmentUrl: 'Mechanics_Newtons_Laws_Overview.pdf',
              commentCount: 1,
              createdAt: Timestamp.now()
            },
            lesson_chem_1: {
              id: 'lesson_chem_1',
              teacherId: 'teacher_uid',
              subjectId: 'a_chemistry',
              classId: 'S5',
              termId: '2026_term1',
              topic: 'Physical Chemistry',
              title: 'Volumetric Analysis & Titration Curve',
              googleDriveId: 'chem_titrate_id',
              pdfAttachmentUrl: 'Volumetric_Titration_Practical_Guide.pdf',
              commentCount: 0,
              createdAt: Timestamp.now()
            }
          };
          const fallbackData = mockLessonsList[lessonId] || mockLessonsList['lesson_math_1'];
          setLesson(fallbackData);
        }

        // Load mock comments
        const mockComments: Record<string, LessonComment[]> = {
          lesson_math_1: [
            {
              id: 'c1',
              userId: 'student_a_level_uid',
              displayName: 'Nakato Sarah',
              userRole: 'student_parent',
              text: 'The explanation on calculus derivatives was very clear! Thank you, Mr. Okello.',
              createdAt: Timestamp.now()
            },
            {
              id: 'c2',
              userId: 'admin_uid',
              displayName: 'Hajati Zaminah (Headmistress)',
              userRole: 'admin',
              text: 'Excellent pedagogy displayed here, James. Keep up the high standard.',
              createdAt: Timestamp.now()
            }
          ],
          lesson_phys_1: [
            {
              id: 'c3',
              userId: 'student_a_level_uid',
              displayName: 'Kembabazi Joanita',
              userRole: 'student_parent',
              text: 'I loved the real-world physics animation examples. It makes equations easy to conceptualize!',
              createdAt: Timestamp.now()
            }
          ]
        };

        setComments(mockComments[lessonId] || []);
      } catch (e) {
        console.error('Error fetching lesson:', e);
      } finally {
        setLoading(false);
      }
    }

    loadLessonDetails();
  }, [lessonId]);

  // Simulate downloading pdf attachment
  const handleDownload = () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadPercent(0);

    const interval = setInterval(() => {
      setDownloadPercent(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setDownloading(false), 800);
          return 100;
        }
        return prev + 20;
      });
    }, 200);
  };

  const handlePostComment = () => {
    if (!newCommentText.trim()) return;

    const user = auth.currentUser;
    const newComment: LessonComment = {
      id: Math.random().toString(),
      userId: user?.uid || 'temp_user',
      displayName: user?.email === 'student@nabisunsa.ac.ug' ? 'Nakato Sarah' : 'Hajati Beatrice (Parent)',
      userRole: 'student_parent',
      text: newCommentText.trim(),
      createdAt: Timestamp.now()
    };

    setComments(prev => [...prev, newComment]);
    setNewCommentText('');
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.gold} />
      </View>
    );
  }

  if (!lesson) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Lesson not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Nav Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>GDrive Stream</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Corporate Video Stream Box (Real Inline GDrive Stream Player) */}
      <View style={[styles.videoBox, { backgroundColor: scheme === 'dark' ? '#000000' : '#0B1426', height: playerHeight }]}>
        {Platform.OS === 'web' ? (
          <iframe
            src={getGoogleDriveEmbedUrl(lesson.googleDriveId)}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <WebView
            source={{ uri: getGoogleDriveEmbedUrl(lesson.googleDriveId) }}
            style={{ flex: 1 }}
            allowsFullscreenVideo
            allowsInlineMediaPlayback={true}
            scalesPageToFit={false}
            mediaPlaybackRequiresUserAction={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            injectedJavaScript={injectedJS}
            userAgent={Platform.OS === 'android' ? "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36" : undefined}
            originWhitelist={['*']}
            onShouldStartLoadWithRequest={(request) => {
              // Block external popout / view redirections to protect files
              if (request.url.includes('/view') || (request.url.includes('drive.google.com') && !request.url.includes('/preview'))) {
                return false;
              }
              return true;
            }}
          />
        )}
      </View>

      {/* Watch Fullscreen Button Options */}
      <TouchableOpacity 
        style={[styles.fullscreenBtn, { borderColor: colors.gold }]}
        onPress={() => setIsFullscreen(true)}
      >
        <FontAwesome5 name="expand" size={12} color={colors.gold} style={{ marginRight: 6 }} />
        <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>Watch Fullscreen / Expand Player</Text>
      </TouchableOpacity>

      {/* Secure Native Fullscreen Modal Player */}
      <Modal
        visible={isFullscreen}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setIsFullscreen(false)}
      >
        <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center' }}>
          {Platform.OS === 'web' ? (
            <iframe
              src={getGoogleDriveEmbedUrl(lesson.googleDriveId)}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allow="autoplay; encrypted-media; fullscreen"
              allowFullScreen
            />
          ) : (
            <WebView
              source={{ uri: getGoogleDriveEmbedUrl(lesson.googleDriveId) }}
              style={{ flex: 1 }}
              allowsFullscreenVideo
              allowsInlineMediaPlayback={true}
              scalesPageToFit={false}
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              injectedJavaScript={injectedJS}
              userAgent={Platform.OS === 'android' ? "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36" : undefined}
              originWhitelist={['*']}
              onShouldStartLoadWithRequest={(request) => {
                if (request.url.includes('/view') || (request.url.includes('drive.google.com') && !request.url.includes('/preview'))) {
                  return false;
                }
                return true;
              }}
            />
          )}

          {/* Exit Fullscreen Floating Button */}
          <TouchableOpacity 
            style={styles.exitFullscreenBtn}
            onPress={() => setIsFullscreen(false)}
          >
            <FontAwesome5 name="compress" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>Exit Fullscreen</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Title Details */}
      <View style={styles.titleBlock}>
        <Text style={[styles.subjectTag, { color: colors.gold }]}>
          {lesson.subjectId.replace('a_', '').replace('o_', '').toUpperCase()} • {lesson.topic}
        </Text>
        <Text style={[styles.lessonTitle, { color: colors.text }]}>{lesson.title}</Text>
      </View>

      {/* Attached Study Notes (Syllabus PDF) */}
      <View style={[styles.notesCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
        <View style={styles.notesHeader}>
          <View style={[styles.pdfIconBg, { backgroundColor: colors.champagne }]}>
            <FontAwesome5 name="file-pdf" size={16} color={colors.gold} />
          </View>
          <View style={{ flex: 1, marginLeft: Spacing.two }}>
            <Text style={[styles.notesTitle, { color: colors.text }]}>Attached Syllabus Notes</Text>
            <Text style={[styles.notesFilename, { color: colors.textSecondary }]}>
              {lesson.pdfAttachmentUrl}
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.downloadBtn, { backgroundColor: colors.primary }]}
          onPress={handleDownload}
          disabled={downloading}
        >
          {downloading ? (
            <Text style={styles.downloadBtnText}>
              Downloading {downloadPercent}% ...
            </Text>
          ) : (
            <>
              <FontAwesome5 name="cloud-download-alt" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.downloadBtnText}>Download PDF Notes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Comments Board */}
      <View style={styles.commentsSection}>
        <Text style={[styles.sectionHeader, { color: colors.text }]}>
          Lesson Q&A Discussion ({comments.length})
        </Text>

        {/* Create Comment Form */}
        <View style={styles.commentForm}>
          <TextInput
            style={[styles.commentInput, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.backgroundElement }]}
            placeholder="Type a question or class review..."
            placeholderTextColor={colors.textSecondary + '80'}
            value={newCommentText}
            onChangeText={setNewCommentText}
          />
          <TouchableOpacity 
            style={[styles.postBtn, { backgroundColor: colors.primary }]}
            onPress={handlePostComment}
          >
            <Text style={styles.postBtnText}>Post</Text>
          </TouchableOpacity>
        </View>

        {/* Comments Feed List */}
        {comments.map((comment) => (
          <View key={comment.id} style={[styles.commentItem, { borderBottomColor: colors.gold + '20' }]}>
            <View style={styles.commentMeta}>
              <Text style={[styles.commenterName, { color: colors.text }]}>{comment.displayName}</Text>
              <Text style={[styles.roleBadge, { color: colors.gold }]}>
                {comment.userRole === 'admin' ? 'Headmistress' : 'Student/Parent'}
              </Text>
            </View>
            <Text style={[styles.commentText, { color: colors.textSecondary }]}>
              {comment.text}
            </Text>
          </View>
        ))}
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
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  videoBox: {
    width: '100%',
    // Height is set dynamically via playerHeight (56% of screen height)
    borderRadius: Spacing.three,
    overflow: 'hidden',
    marginBottom: Spacing.three,
    shadowOpacity: 0.15,
    elevation: 5,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F20424D', // Semi transparent navy shade
  },
  playButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    elevation: 4,
  },
  durationTag: {
    position: 'absolute',
    bottom: Spacing.two,
    right: Spacing.three,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: '#00000080',
    paddingVertical: 2,
    paddingHorizontal: Spacing.one,
    borderRadius: 4,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    backgroundColor: '#000000E6', // Black control strip
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#FFFFFF4D',
    borderRadius: 2,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  titleBlock: {
    marginBottom: Spacing.four,
  },
  subjectTag: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  lessonTitle: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  notesCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginBottom: Spacing.four,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  pdfIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notesTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  notesFilename: {
    fontSize: 11,
    marginTop: 2,
  },
  downloadBtn: {
    flexDirection: 'row',
    height: 40,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  commentsSection: {
    marginTop: Spacing.two,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: Spacing.three,
  },
  commentForm: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.four,
  },
  commentInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 40,
    paddingHorizontal: Spacing.three,
    fontSize: 12,
  },
  postBtn: {
    width: 60,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  commentItem: {
    borderBottomWidth: 1,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.one,
  },
  commentMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  commenterName: {
    fontSize: 12,
    fontWeight: '700',
  },
  roleBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  commentText: {
    fontSize: 12,
    lineHeight: 18,
  },
  fullscreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.four,
    width: '100%',
  },
  exitFullscreenBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30,
    right: 20,
    backgroundColor: '#000000B3',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FFFFFF4D',
    zIndex: 999,
  },
});
