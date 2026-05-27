import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, TextInput, Image, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Spacing, MaxContentWidth } from '../../constants/theme';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { saveUserProfile, getSchoolStreams, saveSchoolStreams } from '../../services/db/users';
import { Timestamp } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, isMockMode } from '../../services/firebase';

const preseededScience = require('../../../assets/images/champions/science_champ.png');
const preseededArts = require('../../../assets/images/champions/arts_champ.png');

export default function RegisterStudentScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [level, setLevel] = useState<'O-Level' | 'A-Level'>('O-Level');
  const [classId, setClassId] = useState('Senior 1');
  const [stream, setStream] = useState('Blue');
  const [aLevelCombination, setALevelCombination] = useState('PCM');

  // Custom streams state
  const [availableStreams, setAvailableStreams] = useState<string[]>(['Blue', 'Red', 'Green']);
  const [newStreamName, setNewStreamName] = useState('');
  const [showAddStreamModal, setShowAddStreamModal] = useState(false);

  // Batch entry & AI OCR states
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');
  const [scannedStudents, setScannedStudents] = useState<Array<{
    id: string;
    displayName: string;
    registrationNumber: string;
    classId: string;
    stream: string;
    parentEmail: string;
  }>>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanningProgress, setScanningProgress] = useState('');

  useEffect(() => {
    async function loadStreams() {
      try {
        const streamsList = await getSchoolStreams('nabisunsa_girls');
        setAvailableStreams(streamsList);
        if (streamsList.length > 0) {
          // If the default 'Blue' is not in the loaded streams, pick the first one
          if (!streamsList.includes(stream)) {
            setStream(streamsList[0]);
          }
        }
      } catch (err) {
        console.error('Error loading streams:', err);
      }
    }
    loadStreams();
  }, []);
  
  // Image states
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [selectedPreset, setSelectedPreset] = useState<'science' | 'arts' | 'custom' | null>(null);
  const [showPickerDrawer, setShowPickerDrawer] = useState(false);

  const handlePresetSelect = (preset: 'science' | 'arts') => {
    setSelectedPreset(preset);
    // In React Native require statements return local asset numbers. We will pass a recognizable string token
    // or string path to photoUrl so our getChampionImage mapper can resolve it correctly.
    setPhotoUrl(preset === 'science' ? 'science_champ' : 'arts_champ');
    setShowPickerDrawer(false);
  };

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        const msg = 'We need access to your photos to upload student profile pictures.';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Permission Denied', msg);
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setPhotoUrl(result.assets[0].uri);
        setSelectedPreset('custom');
        setShowPickerDrawer(false);
      }
    } catch (err: any) {
      console.error('Error picking image:', err);
      const msg = `Failed to pick image: ${err.message || err}`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        const msg = 'We need camera access to take student profile pictures.';
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Permission Denied', msg);
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets[0].uri) {
        setPhotoUrl(result.assets[0].uri);
        setSelectedPreset('custom');
        setShowPickerDrawer(false);
      }
    } catch (err: any) {
      console.error('Error taking photo:', err);
      const msg = `Failed to take photo: ${err.message || err}`;
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Error', msg);
    }
  };

  const handleRegister = async () => {
    if (!displayName || !registrationNumber) {
      const msg = 'Please fill in Name and Registration Number.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Missing Fields', msg);
      return;
    }

    setLoading(true);
    try {
      const studentUid = `student_${Date.now()}`;
      const studentEmail = `${registrationNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}@nabisunsa.ac.ug`;
      
      let finalPhotoUrl = photoUrl || 'placeholder';
      const isLocalUri = photoUrl && (
        photoUrl.startsWith('file://') || 
        photoUrl.startsWith('content://') || 
        photoUrl.startsWith('ph://') || 
        photoUrl.startsWith('assets-library://')
      );

      if (isLocalUri) {
        if (!isMockMode) {
          try {
            console.log('[Register] Uploading local image to Firebase Storage...');
            const response = await fetch(photoUrl);
            const blob = await response.blob();
            const storageRef = ref(storage, `student_photos/${studentUid}.jpg`);
            await uploadBytes(storageRef, blob);
            finalPhotoUrl = await getDownloadURL(storageRef);
            console.log('[Register] Photo uploaded. URL:', finalPhotoUrl);
          } catch (storageErr) {
            console.error('Error uploading photo to Firebase Storage:', storageErr);
          }
        } else {
          console.log('[Register] Mock mode: keeping local photo URI', photoUrl);
        }
      }

      const newStudentProfile = {
        uid: studentUid,
        email: studentEmail,
        role: 'student_parent' as const,
        displayName: displayName.trim(),
        schoolId: 'nabisunsa_girls',
        photoUrl: finalPhotoUrl,
        classId,
        stream,
        level,
        registrationNumber: registrationNumber.trim().toUpperCase(),
        parentEmail: parentEmail.trim().toLowerCase(),
        aLevelCombination: level === 'A-Level' ? aLevelCombination : undefined,
        subjects: level === 'A-Level' ? ['a_mathematics', 'a_physics', 'a_chemistry'] : ['o_mathematics', 'o_physics', 'o_english'],
        createdAt: Timestamp.now() as any
      };

      await saveUserProfile(studentUid, newStudentProfile);

      const successMsg = `Student "${displayName}" registered successfully! Registered with Reg No: ${registrationNumber.toUpperCase()}. They can log in instantly.`;
      if (Platform.OS === 'web') {
        alert(successMsg);
        router.back();
      } else {
        Alert.alert(
          'Student Registered',
          successMsg,
          [{ text: 'OK', onPress: () => router.back() }]
        );
      }
    } catch (error: any) {
      console.error('Error registering student:', error);
      const errorMsg = `Registration failed: ${error.message || error}`;
      if (Platform.OS === 'web') alert(errorMsg);
      else Alert.alert('Error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Triggers image pick and starts the OCR parser simulation
  const handleRosterImagePick = async (source: 'camera' | 'gallery') => {
    try {
      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          const msg = 'Camera access is required to scan lists.';
          if (Platform.OS === 'web') alert(msg);
          else Alert.alert('Permission Denied', msg);
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          const msg = 'Media library access is required to pick roster photos.';
          if (Platform.OS === 'web') alert(msg);
          else Alert.alert('Permission Denied', msg);
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets[0].uri) {
        startOCRScanSimulation();
      }
    } catch (err) {
      console.error('Error selecting roster list:', err);
    }
  };

  const startOCRScanSimulation = () => {
    setIsScanning(true);
    setScanningProgress('Uploading list photo to AI parsing engine...');

    setTimeout(() => {
      setScanningProgress('AI OCR: Running handwriting & character recognition...');
    }, 1500);

    setTimeout(() => {
      setScanningProgress('AI Parser: Extracting Student Name and Registration columns...');
    }, 3000);

    setTimeout(() => {
      setScanningProgress('Database: Cross-referencing streams and combinations...');
    }, 4500);

    setTimeout(() => {
      setIsScanning(false);
      setScanningProgress('');
      
      const fallbackStream = availableStreams[0] || 'Blue';
      const secondaryStream = availableStreams[1] || fallbackStream;

      // Seed 5 scanned students from Nabisunsa Girls Roster list
      setScannedStudents([
        {
          id: `scanned_1_${Date.now()}`,
          displayName: 'Nagawa Hajarah',
          registrationNumber: 'NGSS/2026/101',
          classId: 'Senior 1',
          stream: fallbackStream,
          parentEmail: 'parent.hajarah@gmail.com',
        },
        {
          id: `scanned_2_${Date.now()}`,
          displayName: 'Nankya Shakirah',
          registrationNumber: 'NGSS/2026/102',
          classId: 'Senior 1',
          stream: fallbackStream,
          parentEmail: 'parent.shakirah@gmail.com',
        },
        {
          id: `scanned_3_${Date.now()}`,
          displayName: 'Namubiru Brenda',
          registrationNumber: 'NGSS/2026/103',
          classId: 'Senior 2',
          stream: secondaryStream,
          parentEmail: '',
        },
        {
          id: `scanned_4_${Date.now()}`,
          displayName: 'Amina Mariam',
          registrationNumber: 'NGSS/2026/104',
          classId: 'Senior 3',
          stream: fallbackStream,
          parentEmail: 'parent.mariam@gmail.com',
        },
        {
          id: `scanned_5_${Date.now()}`,
          displayName: 'Kembabazi Joanita',
          registrationNumber: 'NGSS/2026/105',
          classId: 'Senior 4',
          stream: secondaryStream,
          parentEmail: '',
        }
      ]);
    }, 6000);
  };

  const handleEditScannedStudent = (idx: number, field: string, value: string) => {
    setScannedStudents(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        [field]: value
      };
      return updated;
    });
  };

  const handleDeleteScannedStudent = (idx: number) => {
    setScannedStudents(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddRowManually = () => {
    setScannedStudents(prev => [
      ...prev,
      {
        id: `scanned_manual_${Date.now()}_${prev.length}`,
        displayName: '',
        registrationNumber: `NGSS/2026/0${106 + prev.length}`,
        classId: 'Senior 1',
        stream: availableStreams[0] || 'Blue',
        parentEmail: '',
      }
    ]);
  };

  const handleBulkRegister = async () => {
    if (scannedStudents.length === 0) {
      const msg = 'No student details to register.';
      if (Platform.OS === 'web') alert(msg);
      else Alert.alert('Empty Roster', msg);
      return;
    }

    // Validation check
    for (let i = 0; i < scannedStudents.length; i++) {
      const s = scannedStudents[i];
      if (!s.displayName.trim() || !s.registrationNumber.trim()) {
        const msg = `Row ${i + 1} has empty Name or Registration Number.`;
        if (Platform.OS === 'web') alert(msg);
        else Alert.alert('Validation Error', msg);
        return;
      }
    }

    setLoading(true);
    try {
      // Loop through and write user profiles in database
      for (let i = 0; i < scannedStudents.length; i++) {
        const s = scannedStudents[i];
        const studentUid = `student_batch_${Date.now()}_${i}`;
        const studentEmail = `${s.registrationNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '-')}@nabisunsa.ac.ug`;

        const newStudentProfile = {
          uid: studentUid,
          email: studentEmail,
          role: 'student_parent' as const,
          displayName: s.displayName.trim(),
          schoolId: 'nabisunsa_girls',
          photoUrl: 'placeholder',
          classId: s.classId,
          stream: s.stream,
          level: (s.classId.includes('5') || s.classId.includes('6')) ? 'A-Level' as const : 'O-Level' as const,
          registrationNumber: s.registrationNumber.trim().toUpperCase(),
          parentEmail: s.parentEmail.trim().toLowerCase(),
          subjects: (s.classId.includes('5') || s.classId.includes('6')) 
            ? ['a_mathematics', 'a_physics', 'a_chemistry'] 
            : ['o_mathematics', 'o_physics', 'o_english'],
          createdAt: Timestamp.now() as any
        };

        await saveUserProfile(studentUid, newStudentProfile);
      }

      const successMsg = `Roster Imported! Successfully registered ${scannedStudents.length} students from the scanned list.`;
      if (Platform.OS === 'web') {
        alert(successMsg);
        router.back();
      } else {
        Alert.alert(
          'Bulk Import Success',
          successMsg,
          [{ text: 'Great!', onPress: () => router.back() }]
        );
      }
    } catch (err: any) {
      console.error('Error saving bulk scanned students:', err);
      const errorMsg = `Bulk saving failed: ${err.message || err}`;
      if (Platform.OS === 'web') alert(errorMsg);
      else Alert.alert('Error', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      {/* Nav Bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.backBtn, { borderColor: colors.gold }]} onPress={() => router.back()}>
          <FontAwesome5 name="arrow-left" size={14} color={colors.gold} />
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: colors.text }]}>Student Registry</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Header */}
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: colors.text }]}>Register New Student Profile</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Create student parent directory entries. Pre-configure national curriculum level, streams, combination eligibility, and profile portraits.
        </Text>
      </View>

      {/* Entry Mode Toggle Tabs */}
      <View style={[styles.tabContainer, { borderColor: colors.gold + '20', backgroundColor: colors.backgroundElement, marginBottom: Spacing.four }]}>
        <TouchableOpacity 
          style={[styles.tabButton, entryMode === 'single' && { backgroundColor: colors.primary }]}
          onPress={() => setEntryMode('single')}
        >
          <Text style={[styles.tabButtonText, { color: colors.textSecondary }, entryMode === 'single' && { color: '#FFFFFF', fontWeight: '700' }]}>
            Single Entry
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tabButton, entryMode === 'batch' && { backgroundColor: colors.primary }]}
          onPress={() => setEntryMode('batch')}
        >
          <Text style={[styles.tabButtonText, { color: colors.textSecondary }, entryMode === 'batch' && { color: '#FFFFFF', fontWeight: '700' }]}>
            AI OCR List Import
          </Text>
        </TouchableOpacity>
      </View>

      {entryMode === 'single' ? (
        /* Form Card */
        <View style={[styles.formCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
          
          {/* Photo Upload Area */}
          <View style={styles.photoContainer}>
            <Text style={[styles.label, { color: colors.text, alignSelf: 'flex-start' }]}>Profile Photo Provision</Text>
            <View style={[styles.avatarPreviewFrame, { borderColor: colors.gold }]}>
              {selectedPreset === 'science' ? (
                <Image source={preseededScience} style={styles.avatarImage} />
              ) : selectedPreset === 'arts' ? (
                <Image source={preseededArts} style={styles.avatarImage} />
              ) : photoUrl ? (
                <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <FontAwesome5 name="user-graduate" size={40} color={colors.gold} />
                </View>
              )}
            </View>

            <TouchableOpacity 
              style={[styles.photoSelectBtn, { borderColor: colors.gold }]}
              onPress={() => setShowPickerDrawer(!showPickerDrawer)}
            >
              <FontAwesome5 name="camera" size={12} color={colors.gold} style={{ marginRight: 6 }} />
              <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>
                Choose Photo Provision
              </Text>
            </TouchableOpacity>

            {/* Sliding option drawer */}
            {showPickerDrawer && (
              <View style={[styles.drawerContent, { backgroundColor: colors.background, borderColor: colors.gold + '30' }]}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: colors.textSecondary, marginBottom: Spacing.two, textTransform: 'uppercase' }}>
                  Select Image Source
                </Text>

                {/* Device Photo / Camera upload buttons */}
                <View style={{ flexDirection: 'row', gap: Spacing.two, width: '100%', marginBottom: Spacing.three }}>
                  <TouchableOpacity 
                    style={[styles.cameraActionBtn, { backgroundColor: colors.primary, flex: 1 }]}
                    onPress={pickImage}
                  >
                    <FontAwesome5 name="images" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                      Choose Gallery
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.cameraActionBtn, { backgroundColor: colors.gold, flex: 1 }]}
                    onPress={takePhoto}
                  >
                    <FontAwesome5 name="camera" size={12} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                      Take Photo
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textSecondary + '70', marginBottom: Spacing.two, textTransform: 'uppercase', alignSelf: 'flex-start' }}>
                  Or Select Preset Portrait
                </Text>
                
                <View style={{ flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three, width: '100%' }}>
                  <TouchableOpacity 
                    style={[styles.drawerItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold + '20' }]}
                    onPress={() => handlePresetSelect('science')}
                  >
                    <Image source={preseededScience} style={styles.drawerPresetImage} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text, marginTop: 4 }}>Portrait A</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.drawerItem, { backgroundColor: colors.backgroundElement, borderColor: colors.gold + '20' }]}
                    onPress={() => handlePresetSelect('arts')}
                  >
                    <Image source={preseededArts} style={styles.drawerPresetImage} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.text, marginTop: 4 }}>Portrait B</Text>
                  </TouchableOpacity>
                </View>

                {/* Simulated camera */}
                <TouchableOpacity 
                  style={[styles.cameraActionBtn, { backgroundColor: colors.primary, width: '100%' }]}
                  onPress={() => {
                    // Simulate photo capture with a random cool avatar URL
                    const randomId = Math.floor(Math.random() * 100);
                    setPhotoUrl(`https://avatar.iran.liara.run/public/girl?username=student_${randomId}`);
                    setSelectedPreset('custom');
                    setShowPickerDrawer(false);
                  }}
                >
                  <FontAwesome5 name="bolt" size={10} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>
                    Simulate Camera Capture
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Student Name */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Student Full Name</Text>
            <TextInput
              style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
              placeholder="e.g. Nabwanika Hajarah"
              placeholderTextColor={colors.textSecondary + '80'}
              value={displayName}
              onChangeText={setDisplayName}
            />
          </View>

          {/* Registration Number */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Registration Number</Text>
            <TextInput
              style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
              placeholder="e.g. NGSS/2026/089"
              placeholderTextColor={colors.textSecondary + '80'}
              value={registrationNumber}
              onChangeText={setRegistrationNumber}
            />
          </View>

          {/* Parent Linked Email */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Parent Linked Email (Optional)</Text>
            <TextInput
              style={[styles.inputField, { color: colors.text, borderColor: colors.gold, backgroundColor: colors.background }]}
              placeholder="e.g. parent.mail@gmail.com"
              placeholderTextColor={colors.textSecondary + '80'}
              keyboardType="email-address"
              value={parentEmail}
              onChangeText={setParentEmail}
            />
          </View>

          {/* Level selection */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Academic Level Track</Text>
            <View style={styles.rowToggles}>
              <TouchableOpacity 
                style={[styles.toggleBtn, level === 'O-Level' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => {
                  setLevel('O-Level');
                  setClassId('Senior 1');
                }}
              >
                <Text style={[styles.toggleBtnText, { color: colors.text }, level === 'O-Level' && { color: '#FFFFFF' }]}>
                  Ordinary Level (O-Level)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.toggleBtn, level === 'A-Level' && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                onPress={() => {
                  setLevel('A-Level');
                  setClassId('Senior 5');
                }}
              >
                <Text style={[styles.toggleBtnText, { color: colors.text }, level === 'A-Level' && { color: '#FFFFFF' }]}>
                  Advanced Level (A-Level)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Class Selection Grid */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Target Academic Class</Text>
            <View style={styles.rowToggles}>
              {level === 'O-Level' ? (
                ['Senior 1', 'Senior 2', 'Senior 3', 'Senior 4'].map((cls) => (
                  <TouchableOpacity 
                    key={cls}
                    style={[styles.toggleBtn, { flex: 1 }, classId === cls && { backgroundColor: colors.gold, borderColor: colors.gold }]}
                    onPress={() => setClassId(cls)}
                  >
                    <Text style={[styles.toggleBtnText, { color: colors.text }, classId === cls && { color: '#FFFFFF' }]}>
                      {cls.replace('Senior ', 'S')}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                ['Senior 5', 'Senior 6'].map((cls) => (
                  <TouchableOpacity 
                    key={cls}
                    style={[styles.toggleBtn, { flex: 1 }, classId === cls && { backgroundColor: colors.gold, borderColor: colors.gold }]}
                    onPress={() => setClassId(cls)}
                  >
                    <Text style={[styles.toggleBtnText, { color: colors.text }, classId === cls && { color: '#FFFFFF' }]}>
                      {cls.replace('Senior ', 'S')}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>

          {/* Stream selection */}
          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={[styles.label, { color: colors.text, marginBottom: 0 }]}>Class Stream</Text>
              <TouchableOpacity onPress={() => setShowAddStreamModal(true)} style={{ paddingVertical: 2 }}>
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '700' }}>+ Customize Streams</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
              {availableStreams.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontStyle: 'italic', paddingVertical: 8 }}>
                  No streams configured. Tap "+ Customize Streams" to add.
                </Text>
              ) : (
                availableStreams.map((st) => (
                  <TouchableOpacity 
                    key={st}
                    style={[
                      styles.streamPill, 
                      { borderColor: colors.gold + '40', backgroundColor: colors.backgroundElement }, 
                      stream === st && { backgroundColor: colors.primary, borderColor: colors.primary }
                    ]}
                    onPress={() => setStream(st)}
                  >
                    <Text style={[styles.streamPillText, { color: colors.text }, stream === st && { color: '#FFFFFF', fontWeight: '700' }]}>
                      {st}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>

          {/* Customize Streams Modal */}
          <Modal
            visible={showAddStreamModal}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setShowAddStreamModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={[styles.modalCard, { backgroundColor: colors.background, borderColor: colors.gold + '30' }]}>
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Manage Class Streams</Text>
                  <TouchableOpacity onPress={() => setShowAddStreamModal(false)} style={{ padding: 4 }}>
                    <FontAwesome5 name="times" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  Define the streams used at Nabisunsa Girls' Secondary School.
                </Text>

                {/* List of current streams */}
                <ScrollView style={{ maxHeight: 180, marginBottom: Spacing.three }} contentContainerStyle={{ gap: 6 }}>
                  {availableStreams.length === 0 ? (
                    <Text style={{ color: colors.textSecondary, fontStyle: 'italic', fontSize: 12, paddingVertical: 10, textAlign: 'center' }}>
                      No streams defined. Add one below.
                    </Text>
                  ) : (
                    availableStreams.map((st) => (
                      <View 
                        key={st} 
                        style={[
                          styles.modalStreamItem, 
                          { 
                            borderColor: colors.gold + '15',
                            backgroundColor: colors.backgroundElement
                          }
                        ]}
                      >
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 13 }}>{st}</Text>
                        <TouchableOpacity 
                          onPress={async () => {
                            const updated = availableStreams.filter(item => item !== st);
                            setAvailableStreams(updated);
                            if (stream === st) {
                              setStream(updated[0] || '');
                            }
                            await saveSchoolStreams('nabisunsa_girls', updated);
                          }}
                          style={{ padding: 6 }}
                        >
                          <FontAwesome5 name="trash" size={12} color="#E74C3C" />
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>

                {/* Add new stream */}
                <View style={styles.addStreamForm}>
                  <TextInput
                    style={[
                      styles.inputField, 
                      { 
                        flex: 1, 
                        color: colors.text, 
                        borderColor: colors.gold + '40', 
                        backgroundColor: colors.backgroundElement,
                        height: 40 
                      }
                    ]}
                    placeholder="e.g. S1A, Compassion, Gold..."
                    placeholderTextColor={colors.textSecondary + '70'}
                    value={newStreamName}
                    onChangeText={setNewStreamName}
                  />
                  <TouchableOpacity 
                    style={[styles.addStreamBtn, { backgroundColor: colors.primary }]}
                    onPress={async () => {
                      const trimmed = newStreamName.trim();
                      if (!trimmed) return;
                      if (availableStreams.includes(trimmed)) {
                        Alert.alert('Duplicate', 'This stream already exists.');
                        return;
                      }
                      const updated = [...availableStreams, trimmed];
                      setAvailableStreams(updated);
                      setStream(trimmed);
                      setNewStreamName('');
                      await saveSchoolStreams('nabisunsa_girls', updated);
                    }}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 12 }}>Add</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={[styles.closeModalBtn, { backgroundColor: colors.gold }]}
                  onPress={() => setShowAddStreamModal(false)}
                >
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Combination Selection (A-Level only) */}
          {level === 'A-Level' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: colors.text }]}>UACE Principal Combination</Text>
              <View style={styles.rowToggles}>
                {['PCM', 'PCB', 'BCM', 'HEG', 'HEL', 'DEG'].map((comb) => (
                  <TouchableOpacity 
                    key={comb}
                    style={[styles.toggleBtn, { minWidth: 50 }, aLevelCombination === comb && { backgroundColor: colors.gold, borderColor: colors.gold }]}
                    onPress={() => setALevelCombination(comb)}
                  >
                    <Text style={[styles.toggleBtnText, { color: colors.text }, aLevelCombination === comb && { color: '#FFFFFF' }]}>
                      {comb}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Save button */}
          <TouchableOpacity 
            style={[styles.registerBtn, { backgroundColor: colors.primary }]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <FontAwesome5 name="user-plus" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.registerBtnText}>Create Student Account</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* AI OCR Batch Card */
        <View style={[styles.formCard, { backgroundColor: colors.backgroundElement, borderColor: colors.gold }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two, gap: 10 }}>
            <FontAwesome5 name="robot" size={20} color={colors.gold} />
            <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 0 }]}>AI OCR Class Roster Scan</Text>
          </View>
          
          {isScanning ? (
            /* Scanning Laser Active State */
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size="large" color={colors.gold} style={{ marginBottom: 16 }} />
              <View style={[styles.scanLine, { backgroundColor: colors.gold }]} />
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'center', marginBottom: 4 }}>
                {scanningProgress}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 11, textAlign: 'center' }}>
                Please keep your app open. Analysing handwriting list structures...
              </Text>
            </View>
          ) : scannedStudents.length === 0 ? (
            /* Import Trigger View */
            <View style={{ alignItems: 'center', paddingVertical: 30, gap: 16 }}>
              <FontAwesome5 name="file-invoice" size={48} color={colors.gold + '80'} />
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', paddingHorizontal: 20, lineHeight: 18 }}>
                Photograph or upload a handwritten or printed student roster list. The AI scanner will extract Name, Registration Number, Class, and Stream.
              </Text>
              
              <View style={{ width: '100%', gap: 10, marginTop: 10 }}>
                <TouchableOpacity 
                  style={[styles.actionBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleRosterImagePick('camera')}
                >
                  <FontAwesome5 name="camera" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.actionBtnText}>Capture List with Camera</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionBtn, { borderColor: colors.gold, borderWidth: 1 }]}
                  onPress={() => handleRosterImagePick('gallery')}
                >
                  <FontAwesome5 name="images" size={14} color={colors.gold} style={{ marginRight: 8 }} />
                  <Text style={[styles.actionBtnText, { color: colors.gold }]}>Select List from Gallery</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Spreadsheet editor grid view */
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Parsed Student List ({scannedStudents.length})
                </Text>
                <TouchableOpacity 
                  style={[styles.addMinBtn, { borderColor: colors.gold }]}
                  onPress={handleAddRowManually}
                >
                  <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '700' }}>+ Add Row</Text>
                </TouchableOpacity>
              </View>

              {/* Roster Spreadsheet Grid */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ gap: 8 }}>
                  {/* Table Header Row */}
                  <View style={[styles.tableRowHeader, { backgroundColor: colors.primary }]}>
                    <Text style={[styles.tableTh, { width: 140 }]}>Student Name</Text>
                    <Text style={[styles.tableTh, { width: 120 }]}>Reg Number</Text>
                    <Text style={[styles.tableTh, { width: 90 }]}>Class ID</Text>
                    <Text style={[styles.tableTh, { width: 90 }]}>Stream</Text>
                    <Text style={[styles.tableTh, { width: 140 }]}>Parent Email (Opt)</Text>
                    <Text style={[styles.tableTh, { width: 40, textAlign: 'center' }]}>Del</Text>
                  </View>

                  {/* Table Roster Rows */}
                  {scannedStudents.map((item, idx) => (
                    <View key={item.id} style={styles.tableRowItem}>
                      <TextInput
                        style={[styles.gridInput, { width: 140, color: colors.text, borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                        value={item.displayName}
                        onChangeText={(val) => handleEditScannedStudent(idx, 'displayName', val)}
                        placeholder="e.g. Nagawa Hajarah"
                        placeholderTextColor={colors.textSecondary + '40'}
                      />
                      <TextInput
                        style={[styles.gridInput, { width: 120, color: colors.text, borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                        value={item.registrationNumber}
                        onChangeText={(val) => handleEditScannedStudent(idx, 'registrationNumber', val)}
                        placeholder="e.g. NGSS/2026/101"
                        placeholderTextColor={colors.textSecondary + '40'}
                        autoCapitalize="characters"
                      />
                      <TextInput
                        style={[styles.gridInput, { width: 90, color: colors.text, borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                        value={item.classId}
                        onChangeText={(val) => handleEditScannedStudent(idx, 'classId', val)}
                        placeholder="Senior 1"
                        placeholderTextColor={colors.textSecondary + '40'}
                      />
                      <TextInput
                        style={[styles.gridInput, { width: 90, color: colors.text, borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                        value={item.stream}
                        onChangeText={(val) => handleEditScannedStudent(idx, 'stream', val)}
                        placeholder="Compassion"
                        placeholderTextColor={colors.textSecondary + '40'}
                      />
                      <TextInput
                        style={[styles.gridInput, { width: 140, color: colors.text, borderColor: colors.gold + '30', backgroundColor: colors.background }]}
                        value={item.parentEmail}
                        onChangeText={(val) => handleEditScannedStudent(idx, 'parentEmail', val)}
                        placeholder="parent@mail.com"
                        placeholderTextColor={colors.textSecondary + '40'}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                      <TouchableOpacity 
                        onPress={() => handleDeleteScannedStudent(idx)}
                        style={{ width: 40, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <FontAwesome5 name="trash" size={12} color="#E74C3C" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </ScrollView>

              {/* Bulk Actions Button */}
              <TouchableOpacity 
                style={[styles.registerBtn, { backgroundColor: colors.primary, marginTop: 10 }]}
                onPress={handleBulkRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <FontAwesome5 name="cloud-upload-alt" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
                    <Text style={styles.registerBtnText}>Approve & Bulk Register {scannedStudents.length} Students</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity 
                style={{ alignSelf: 'center', marginTop: 16 }}
                onPress={() => setScannedStudents([])}
              >
                <Text style={{ color: colors.gold, fontSize: 12, textDecorationLine: 'underline', fontWeight: '700' }}>
                  Clear list and scan another image
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
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
  headerBlock: {
    marginBottom: Spacing.four,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  formCard: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    shadowOpacity: 0.01,
    elevation: 1,
  },
  photoContainer: {
    alignItems: 'center',
    marginBottom: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE5D520',
    paddingBottom: Spacing.four,
  },
  avatarPreviewFrame: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F204205',
    marginVertical: Spacing.three,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoSelectBtn: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  drawerContent: {
    width: '100%',
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.three,
    marginTop: Spacing.three,
    alignItems: 'center',
  },
  drawerItem: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: 6,
    alignItems: 'center',
  },
  drawerPresetImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  cameraActionBtn: {
    flexDirection: 'row',
    height: 34,
    borderRadius: Spacing.one,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  inputField: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 44,
    paddingHorizontal: Spacing.three,
    fontSize: 13,
    width: '100%',
  },
  rowToggles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toggleBtn: {
    borderWidth: 1,
    borderColor: '#D4AF3740',
    borderRadius: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  registerBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  registerBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000080',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: Spacing.three,
    borderWidth: 1,
    padding: Spacing.four,
    shadowOpacity: 0.15,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: Spacing.three,
  },
  modalStreamItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 6,
  },
  addStreamForm: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: Spacing.four,
  },
  addStreamBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeModalBtn: {
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  streamPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  streamPillText: {
    fontSize: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: 4,
    overflow: 'hidden',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  scanLine: {
    height: 3,
    width: '85%',
    alignSelf: 'center',
    marginVertical: 12,
    borderRadius: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    height: 46,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  addMinBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableRowHeader: {
    flexDirection: 'row',
    borderRadius: 6,
    padding: 8,
    alignItems: 'center',
  },
  tableTh: {
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 4,
    color: '#FFFFFF',
  },
  tableRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gridInput: {
    borderWidth: 1,
    borderRadius: 6,
    height: 38,
    paddingHorizontal: 8,
    fontSize: 12,
  },
});
