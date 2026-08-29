/**
 * Turning the school's printed slip into an account.
 *
 * A parent is holding a piece of paper with her daughter's registration
 * number and a six-character code. That is the whole input. Everything else
 * — which child, which school, whether the code is still good — is decided
 * on the server.
 *
 * The screen is deliberately plain. It is used once, often by someone who
 * does not use apps much, sometimes standing in a school corridor.
 */

import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Colors, Spacing } from '../constants/theme';
import { Brand } from '../constants/brand';
import { useSession } from '../services/session';

export default function ActivateScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const { activate } = useSession();

  const [registrationNo, setRegistrationNo] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleActivate = async () => {
    setErrorMessage('');
    if (!registrationNo.trim() || !code.trim()) {
      setErrorMessage('Enter the registration number and the code from the slip.');
      return;
    }

    setLoading(true);
    try {
      await activate({
        registrationNo: registrationNo.trim(),
        code: code.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      // The root layout notices the session and moves on.
    } catch (error: any) {
      setErrorMessage(error?.message || 'That did not work. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

        <View style={styles.headerSection}>
          <View
            style={[
              styles.crest,
              { borderColor: colors.gold, backgroundColor: colors.backgroundElement },
            ]}
          >
            <FontAwesome5 name="id-card" size={28} color={colors.gold} />
          </View>
          <Text style={[styles.mainTitle, { color: colors.text }]}>Activate your account</Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            Use the slip {Brand.shortName} gave you
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.backgroundElement, borderColor: colors.gold },
          ]}
        >
          {errorMessage ? (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: colors.error + '1A', borderColor: colors.error },
              ]}
            >
              <Text style={[styles.errorText, { color: colors.error }]}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Registration number</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: colors.gold, backgroundColor: colors.background },
              ]}
            >
              <TextInput
                style={[styles.input, { color: colors.text }]}
                testID="reg-no"
                placeholder="As printed on the slip"
                placeholderTextColor={colors.textSecondary + '80'}
                value={registrationNo}
                onChangeText={setRegistrationNo}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Access code</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: colors.gold, backgroundColor: colors.background },
              ]}
            >
              <TextInput
                // Wide and spaced, because it is copied character by
                // character off paper.
                style={[styles.input, styles.codeInput, { color: colors.text }]}
                testID="code"
                placeholder="ABC-DEF"
                placeholderTextColor={colors.textSecondary + '80'}
                value={code}
                onChangeText={setCode}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Choose a password</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: colors.gold, backgroundColor: colors.background },
              ]}
            >
              <TextInput
                style={[styles.input, { color: colors.text }]}
                testID="new-password"
                placeholder="At least 8 characters"
                placeholderTextColor={colors.textSecondary + '80'}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={secureText}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeBtn}>
                <FontAwesome5
                  name={secureText ? 'eye-slash' : 'eye'}
                  size={14}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              You will use this every time. The school cannot see it.
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>
              Phone number <Text style={{ fontWeight: '400' }}>(optional)</Text>
            </Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: colors.gold, backgroundColor: colors.background },
              ]}
            >
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="0700 000000"
                placeholderTextColor={colors.textSecondary + '80'}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Sign in with this number instead of an email address.
            </Text>
          </View>

          <TouchableOpacity
            testID="activate"
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={handleActivate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Activate</Text>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => router.replace('/')}>
          <Text style={[styles.link, { color: colors.primary }]}>
            I already have an account — sign in
          </Text>
        </TouchableOpacity>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          No slip? The school office issues them.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
  },
  headerSection: { alignItems: 'center', marginBottom: Spacing.four },
  crest: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  mainTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  subTitle: { fontSize: 12, textAlign: 'center', marginTop: Spacing.one },
  card: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    marginBottom: Spacing.four,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  errorText: { fontSize: 12, fontWeight: '600' },
  inputGroup: { marginBottom: Spacing.three },
  label: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.one },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 48,
    paddingHorizontal: Spacing.two,
  },
  input: { flex: 1, fontSize: 14, height: '100%' },
  codeInput: { fontSize: 20, letterSpacing: 4, fontWeight: '700' },
  eyeBtn: { padding: Spacing.two },
  hint: { fontSize: 11, marginTop: 4 },
  primaryBtn: {
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  link: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.four },
  footer: { fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
});
