/**
 * Turning the school's printed slip into an account.
 *
 * A parent is holding a piece of paper with her daughter's registration
 * number and a six-character code. That is the whole input.
 *
 * Used once, often by someone who does not use apps much, sometimes standing
 * in a school corridor — so it is one column, large targets, and every field
 * says what it is for underneath rather than in a placeholder that vanishes
 * the moment they start typing.
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
  Space,
  Type,
  usePalette,
} from '../components/ui';
import { Brand } from '../constants/brand';
import { useSession } from '../services/session';

export default function ActivateScreen() {
  const c = usePalette();
  const router = useRouter();
  const { activate } = useSession();

  const [registrationNo, setRegistrationNo] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!registrationNo.trim() || !code.trim()) {
      setError('Enter the registration number and the code from the slip.');
      return;
    }
    setBusy(true);
    try {
      await activate({
        registrationNo: registrationNo.trim(),
        code: code.trim(),
        password,
        phone: phone.trim() || undefined,
      });
      // The root layout notices the session and moves on.
    } catch (e: any) {
      setError(e?.message || 'That did not work. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Screen>
        <StatusBar style={c.scheme === 'dark' ? 'light' : 'dark'} />

        <View style={styles.top}>
          <View style={[styles.crest, { borderColor: c.gold, backgroundColor: c.backgroundElement }]}>
            <FontAwesome5 name="id-card" size={24} color={c.gold} />
          </View>
          <Text style={[Type.title, { color: c.text, textAlign: 'center' }]}>
            Activate your account
          </Text>
          <Text style={[Type.caption, { color: c.textSecondary, textAlign: 'center' }]}>
            Using the slip {Brand.shortName} gave you
          </Text>
        </View>

        <Card>
          {error ? <Notice tone="error">{error}</Notice> : null}

          <Field label="Registration number">
            <Input
              testID="reg-no"
              placeholder="As printed on the slip"
              value={registrationNo}
              onChangeText={setRegistrationNo}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </Field>

          <Field label="Access code">
            <Input
              testID="code"
              // Wide and spaced: it is copied character by character off paper.
              style={styles.code}
              placeholder="ABC-DEF"
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
            />
          </Field>

          <Field label="Choose a password" hint="You will use this every time. The school cannot see it.">
            <Input
              testID="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secure}
              autoCapitalize="none"
              autoCorrect={false}
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

          <Field
            label="Phone number (optional)"
            hint="Sign in with this number instead of an email address."
          >
            <Input
              placeholder="0700 000000"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoCorrect={false}
            />
          </Field>

          <PrimaryButton testID="activate" label="Activate" onPress={submit} busy={busy} />
        </Card>

        <TouchableOpacity onPress={() => router.replace('/')} style={styles.link}>
          <Text style={[Type.label, { color: c.primary }]}>
            I already have an account — sign in
          </Text>
        </TouchableOpacity>

        <Text style={[Type.caption, styles.footer, { color: c.textSecondary }]}>
          No slip? The school office issues them.
        </Text>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', marginBottom: Space.section },
  crest: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.gap,
  },
  code: { fontSize: 21, letterSpacing: 5, fontWeight: '700' },
  eye: { paddingLeft: Space.base, paddingVertical: Space.snug },
  link: { alignItems: 'center', paddingVertical: Space.base },
  footer: { textAlign: 'center' },
});
