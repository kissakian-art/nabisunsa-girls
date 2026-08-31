/**
 * The parts every screen is built from.
 *
 * Before this, each screen carried its own StyleSheet: five button styles,
 * four card treatments, paddings chosen per screen. Individually reasonable,
 * together it reads as several apps stitched together — which is exactly the
 * impression a school must not get from something it is paying for.
 *
 * So the rules live here once. A screen chooses what to show; it does not
 * choose how tall a button is.
 *
 * The look is deliberately restrained: white cards on an off-white ground, a
 * navy that carries the weight, and gold used as an accent rather than a
 * colour. A parent's eye should land on her daughter's mark, and nothing
 * should compete with it.
 */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Colors, MaxContentWidth } from '../constants/theme';

/**
 * One spacing scale, in multiples of four.
 *
 * Named for what they are rather than what they measure, so "the gap between
 * a label and its field" is a decision made once.
 */
export const Space = {
  hair: 2,
  tight: 4,
  snug: 8,
  base: 12,
  gap: 16,
  section: 24,
  page: 32,
} as const;

/** One type scale. Sizes stop being an opinion held per screen. */
export const Type = StyleSheet.create({
  display: { fontSize: 36, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2 },
  heading: { fontSize: 15, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 11.5, lineHeight: 17 },
  overline: { fontSize: 10.5, fontWeight: '700', letterSpacing: 1.1 },
});

export const Radius = { card: 14, control: 10, pill: 999 } as const;

export function usePalette() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  return {
    ...colors,
    scheme,
    /** Hairline separators and card edges: present, never loud. */
    border: scheme === 'dark' ? '#22324B' : '#E7E4DA',
    onPrimary: '#FFFFFF',
  };
}

// ---------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------

export function Screen({
  children,
  onRefresh,
  refreshing = false,
  style,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = usePalette();
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.screen, style]}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.gold} />
        ) : undefined
      }
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  );
}

/**
 * The same header on every signed-in screen.
 *
 * The school's name sits above whatever the screen is called, so a parent
 * always knows whose app this is — the thing the school is paying for.
 */
export function AppHeader({
  school,
  title,
  subtitle,
  action,
}: {
  school?: string;
  title: string;
  subtitle?: string;
  action?: { icon: string; onPress: () => void; label: string };
}) {
  const c = usePalette();
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        {school ? (
          <Text style={[Type.overline, { color: c.gold }]} numberOfLines={1}>
            {school.toUpperCase()}
          </Text>
        ) : null}
        <Text style={[Type.title, { color: c.text, marginTop: Space.tight }]}>{title}</Text>
        {subtitle ? (
          <Text style={[Type.caption, { color: c.textSecondary, marginTop: Space.hair }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <TouchableOpacity
          onPress={action.onPress}
          accessibilityLabel={action.label}
          style={[styles.headerAction, { borderColor: c.border }]}
        >
          <FontAwesome5 name={action.icon} size={15} color={c.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function Card({
  children,
  title,
  accent = false,
  style,
  testID,
}: {
  children: ReactNode;
  title?: string;
  /** One card per screen may carry the gold edge. More than one is noise. */
  accent?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const c = usePalette();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        { backgroundColor: c.backgroundElement, borderColor: accent ? c.gold : c.border },
        style,
      ]}
    >
      {title ? (
        <Text style={[Type.heading, { color: c.text, marginBottom: Space.base }]}>{title}</Text>
      ) : null}
      {children}
    </View>
  );
}

/** A hairline between rows inside a card. */
export function Divider() {
  const c = usePalette();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

// ---------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------

export function PrimaryButton({
  label,
  onPress,
  busy = false,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  icon?: string;
  testID?: string;
}) {
  const c = usePalette();
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.button, { backgroundColor: c.primary }]}
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.85}
    >
      {busy ? (
        <ActivityIndicator color={c.onPrimary} size="small" />
      ) : (
        <>
          {icon ? <FontAwesome5 name={icon} size={14} color={c.onPrimary} /> : null}
          <Text style={[Type.label, { color: c.onPrimary, fontSize: 14 }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  testID,
}: {
  label: string;
  onPress: () => void;
  icon?: string;
  testID?: string;
}) {
  const c = usePalette();
  return (
    <TouchableOpacity
      testID={testID}
      style={[styles.button, styles.secondary, { borderColor: c.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon ? <FontAwesome5 name={icon} size={14} color={c.gold} /> : null}
      <Text style={[Type.label, { color: c.text, fontSize: 14 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const c = usePalette();
  return (
    <View style={{ marginBottom: Space.gap }}>
      <Text style={[Type.label, { color: c.text, marginBottom: Space.snug }]}>{label}</Text>
      {children}
      {hint ? (
        <Text style={[Type.caption, { color: c.textSecondary, marginTop: Space.tight }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** A text input that looks the same everywhere, with an optional trailing icon. */
export function Input({
  trailing,
  style,
  ...props
}: TextInputProps & { trailing?: ReactNode }) {
  const c = usePalette();
  return (
    <View style={[styles.inputWrap, { borderColor: c.border, backgroundColor: c.background }]}>
      <TextInput
        placeholderTextColor={c.textSecondary + '99'}
        style={[styles.input, { color: c.text }, style]}
        {...props}
      />
      {trailing}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const c = usePalette();
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? c.gold : c.border,
          backgroundColor: selected ? c.champagne : 'transparent',
        },
      ]}
    >
      <Text style={[Type.label, { color: selected ? c.text : c.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** A grade, or anything else that is one short token of emphasis. */
export function Badge({ label }: { label: string }) {
  const c = usePalette();
  return (
    <View style={[styles.badge, { backgroundColor: c.champagne }]}>
      <Text style={[Type.label, { color: c.text, fontSize: 13 }]}>{label}</Text>
    </View>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'info'; children: ReactNode }) {
  const c = usePalette();
  const colour = tone === 'error' ? c.error : c.gold;
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: colour + '14', borderLeftColor: colour },
      ]}
    >
      <Text style={[Type.caption, { color: tone === 'error' ? c.error : c.text }]}>
        {children}
      </Text>
    </View>
  );
}

export function Loading() {
  const c = usePalette();
  return (
    <View style={{ paddingVertical: Space.page * 2, alignItems: 'center' }}>
      <ActivityIndicator size="large" color={c.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: Space.gap,
    paddingTop: Space.section,
    paddingBottom: Space.page,
  },
  column: { width: '100%', maxWidth: MaxContentWidth },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Space.section,
  },
  headerAction: {
    width: 38,
    height: 38,
    borderRadius: Radius.control,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderWidth: 1,
    borderRadius: Radius.card,
    padding: Space.gap,
    marginBottom: Space.base,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.snug,
    height: 50,
    borderRadius: Radius.control,
    marginBottom: Space.base,
  },
  secondary: { borderWidth: 1, backgroundColor: 'transparent' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.control,
    height: 50,
    paddingHorizontal: Space.base,
  },
  input: { flex: 1, fontSize: 15, height: '100%' },
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: 7,
    paddingHorizontal: Space.gap,
  },
  badge: {
    borderRadius: Radius.control,
    paddingVertical: 4,
    paddingHorizontal: Space.base,
    minWidth: 38,
    alignItems: 'center',
  },
  notice: {
    borderLeftWidth: 3,
    borderRadius: 6,
    paddingVertical: Space.base,
    paddingHorizontal: Space.base,
    marginBottom: Space.gap,
  },
});
