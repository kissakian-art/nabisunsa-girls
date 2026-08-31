/**
 * Sign in.
 *
 * Families only. School staff — the Director of Studies office and the
 * administrators — work in the web portal, and the server refuses a staff
 * account at this door regardless of what this screen shows.
 *
 * This is the first thing a parent sees after installing, so it carries the
 * school's name and nothing else: no diagnostics, no test credentials, no
 * developer anything. It should read like a bank's front door, not a tool.
 */

import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import {
  Card,
  Field,
  Input,
  Notice,
  PrimaryButton,
  Screen,
  SecondaryButton,
  Space,
  Type,
  usePalette,
} from '../components/ui';
import { Brand } from '../constants/brand';
import { useSession } from '../services/session';

export default function LoginScreen() {
  const c = usePalette();
  const router = useRouter();
  const { signIn } = useSession();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!identifier.trim() || !password) {
      setError('Please enter your email or phone number, and your password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(identifier.trim(), password);
      // Navigation is the root layout's job: it watches the session.
    } catch (e: any) {
      // The server gives one message for every failed sign-in, so the app
      // cannot be used to discover which families attend the school. Pass it
      // through rather than guessing at a better one.
      setError(e?.message || 'Sign in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Screen style={styles.centred}>
        <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

        <View style={styles.crestBlock}>
          <View style={[styles.crest, { borderColor: c.gold, backgroundColor: c.backgroundElement }]}>
            <FontAwesome5 name="university" size={30} color={c.gold} />
          </View>
          <Text style={[Type.heading, styles.schoolName, { color: c.text }]}>
            {Brand.name.toUpperCase()}
          </Text>
          <Text style={[Type.caption, { color: c.textSecondary }]}>Parents and students</Text>
        </View>

        <Card>
          {error ? <Notice tone="error">{error}</Notice> : null}

          <Field label="Email or phone number">
            <Input
              placeholder="The one the school has for you"
              value={identifier}
              onChangeText={setIdentifier}
              // Not the email keyboard: this field takes a phone number just
              // as often, and that keyboard hides the digits.
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
            />
          </Field>

          <Field label="Password">
            <Input
              placeholder="Enter password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={submit}
              trailing={
                <TouchableOpacity onPress={() => setSecure(!secure)} style={styles.eye}>
                  <FontAwesome5
                    name={secure ? 'eye-slash' : 'eye'}
                    size={14}
                    color={c.textSecondary}
                  />
                </TouchableOpacity>
              }
            />
          </Field>

          <PrimaryButton testID="sign-in" label="Sign in" onPress={submit} busy={busy} />

          {/* First time here: the school hands out a printed slip, and this
              is the only route from that piece of paper to an account. */}
          <SecondaryButton
            testID="go-activate"
            label="First time? Use the slip from the school"
            onPress={() => router.push('/activate')}
          />

          {/* There is no self-service password reset: accounts belong to the
              school, and only the school can confirm who a parent is. */}
          {Brand.contactEmail ? (
            <Text style={[Type.caption, styles.help, { color: c.textSecondary }]}>
              Forgotten your password, or never received a slip? Contact the school office at{' '}
              {Brand.contactEmail}.
            </Text>
          ) : null}
        </Card>

        <Text style={[Type.caption, styles.footer, { color: c.textSecondary }]}>
          School staff sign in on the school portal, not in this app.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centred: { justifyContent: 'center', paddingTop: Space.page },
  crestBlock: { alignItems: 'center', marginBottom: Space.section },
  crest: {
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.gap,
  },
  schoolName: { textAlign: 'center', letterSpacing: 0.6, marginBottom: Space.tight },
  eye: { paddingLeft: Space.base, paddingVertical: Space.snug },
  help: { textAlign: 'center', marginTop: Space.snug },
  footer: { textAlign: 'center', marginTop: Space.gap },
});
