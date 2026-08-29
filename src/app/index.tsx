/**
 * Sign in.
 *
 * Families only. School staff — the Director of Studies office and the
 * administrators — work in the web portal, not here, and the server refuses
 * a staff account at this door regardless of what this screen shows.
 *
 * The branding is build-time (`constants/brand.ts`) because there is no
 * session yet to read a school name from: this screen has to already look
 * like the school before anyone has proved who they are.
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
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Colors, Spacing } from '../constants/theme';
import { Brand } from '../constants/brand';
import { useSession } from '../services/session';

export default function LoginScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    setErrorMessage('');
    if (!email.trim() || !password) {
      setErrorMessage('Please enter your email or phone number, and your password.');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // Navigation is the root layout's job: it watches the session.
    } catch (error: any) {
      // The server deliberately gives one message for every failed sign-in,
      // so the app cannot be used to discover which families attend the
      // school. Pass it through rather than guessing at a better one.
      setErrorMessage(error?.message || 'Sign in failed. Please try again.');
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
              styles.crestPlaceholder,
              { borderColor: colors.gold, backgroundColor: colors.backgroundElement },
            ]}
          >
            <FontAwesome5 name="university" size={32} color={colors.gold} />
          </View>
          <Text style={[styles.mainTitle, { color: colors.text }]}>
            {Brand.name.toUpperCase()}
          </Text>
          <Text style={[styles.subTitle, { color: colors.textSecondary }]}>
            Parents and students
          </Text>
        </View>

        <View
          style={[
            styles.loginCard,
            { backgroundColor: colors.backgroundElement, borderColor: colors.gold },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>Sign in</Text>

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
            <Text style={[styles.label, { color: colors.text }]}>Email or phone number</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: colors.gold, backgroundColor: colors.background },
              ]}
            >
              <FontAwesome5
                name="envelope"
                size={14}
                color={colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email or phone number"
                placeholderTextColor={colors.textSecondary + '80'}
                value={email}
                onChangeText={setEmail}
                // Not the email keyboard: this field takes a phone number
                // just as often, and that keyboard hides the digits.
                keyboardType="default"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleLogin}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: colors.text }]}>Password</Text>
            <View
              style={[
                styles.inputWrapper,
                { borderColor: colors.gold, backgroundColor: colors.background },
              ]}
            >
              <FontAwesome5
                name="lock"
                size={14}
                color={colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Enter password"
                placeholderTextColor={colors.textSecondary + '80'}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={secureText}
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeBtn}>
                <FontAwesome5
                  name={secureText ? 'eye-slash' : 'eye'}
                  size={14}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, { backgroundColor: colors.primary }]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.loginBtnText}>Sign in</Text>
            )}
          </TouchableOpacity>

          {/* First time here: the school hands out a printed slip, and this
              is the only route from that piece of paper to an account. */}
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: colors.gold }]}
            onPress={() => router.push('/activate')}
          >
            <Text style={[styles.secondaryBtnText, { color: colors.primary }]}>
              First time? Use the slip from the school
            </Text>
          </TouchableOpacity>

          {/* There is no self-service password reset: accounts belong to the
              school, and only the school can confirm who a parent is. */}
          <Text style={[styles.helpText, { color: colors.textSecondary }]}>
            Forgotten your password, or never received a slip? Contact the
            school office at {Brand.contactEmail}.
          </Text>
        </View>

        <Text style={[styles.footer, { color: colors.textSecondary }]}>
          School staff sign in on the school portal, not in this app.
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
  headerSection: {
    alignItems: 'center',
    marginBottom: Spacing.five,
  },
  crestPlaceholder: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.three,
  },
  mainTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  subTitle: {
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  loginCard: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    marginBottom: Spacing.five,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Spacing.four,
    letterSpacing: 0.5,
  },
  errorBox: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: Spacing.one,
    letterSpacing: 0.3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Spacing.two,
    height: 48,
    paddingHorizontal: Spacing.two,
  },
  inputIcon: {
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  eyeBtn: {
    padding: Spacing.two,
  },
  loginBtn: {
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryBtn: {
    height: 46,
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.three,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  helpText: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: Spacing.three,
  },
  footer: {
    fontSize: 10,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
});
