/**
 * Small building blocks shared by every screen.
 *
 * Deliberately plain React Native — no UI library — so the app runs identically
 * on iOS, Android and the web build without a styling toolchain to learn.
 */

import { useMemo } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { MemberPalette, Radius, Spacing, MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled">
      <View style={styles.screenInner}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {actions ? <View style={styles.headerActions}>{actions}</View> : null}
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
      {children}
    </Text>
  );
}

export function Row({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

export function Body({
  children,
  muted,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  return (
    <Text
      style={[
        styles.body,
        { color: muted ? theme.textSecondary : theme.text },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.heading, { color: theme.text }]}>{children}</Text>;
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { borderColor: theme.border }]}>
      <Text style={[styles.body, { color: theme.textSecondary, textAlign: 'center' }]}>
        {children}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export type ButtonTone = 'default' | 'accent' | 'danger';

export function Button({
  label,
  onPress,
  tone = 'default',
  disabled,
  compact,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  compact?: boolean;
}) {
  const theme = useTheme();
  const background =
    tone === 'accent'
      ? theme.accent
      : tone === 'danger'
        ? theme.dangerSoft
        : theme.backgroundSelected;
  const color =
    tone === 'accent' ? '#ffffff' : tone === 'danger' ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: background, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.buttonLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Pill({
  label,
  color,
  background,
  onPress,
  selected,
}: {
  label: string;
  color?: string;
  background?: string;
  onPress?: () => void;
  selected?: boolean;
}) {
  const theme = useTheme();
  const bg = background ?? (selected ? theme.accentSoft : theme.backgroundSelected);
  const fg = color ?? (selected ? theme.accent : theme.textSecondary);

  const content = (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillLabel, { color: fg }]}>{label}</Text>
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {content}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              active && { backgroundColor: theme.background },
            ]}>
            <Text
              style={[
                styles.segmentLabel,
                { color: active ? theme.text : theme.textSecondary },
              ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  suffix,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        onPress={() => onChange(Math.max(min, value - step))}
        style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}>
        <Text style={[styles.stepperGlyph, { color: theme.text }]}>−</Text>
      </Pressable>
      <Text style={[styles.stepperValue, { color: theme.text }]}>
        {value}
        {suffix ? ` ${suffix}` : ''}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        onPress={() => onChange(Math.min(max, value + step))}
        style={[styles.stepperButton, { backgroundColor: theme.backgroundSelected }]}>
        <Text style={[styles.stepperGlyph, { color: theme.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'sentences'}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.background,
            borderColor: theme.border,
          },
        ]}
      />
    </View>
  );
}

export function Toggle({
  label,
  hint,
  value,
  onValueChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={[styles.body, { color: theme.text }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.hint, { color: theme.textSecondary }]}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.accent, false: theme.backgroundSelected }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Domain-flavoured bits
// ---------------------------------------------------------------------------

/** A member's colour, falling back to a stable choice from the palette. */
export function memberColor(id: string, explicit?: string): string {
  if (explicit) return explicit;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return MemberPalette[hash % MemberPalette.length] ?? MemberPalette[0];
}

export function MemberChip({
  name,
  id,
  color,
  muted,
}: {
  name: string;
  id: string;
  color?: string;
  muted?: boolean;
}) {
  const theme = useTheme();
  const dot = memberColor(id, color);
  return (
    <View style={[styles.chip, { backgroundColor: theme.backgroundSelected }]}>
      <View style={[styles.chipDot, { backgroundColor: dot }]} />
      <Text
        style={[
          styles.chipLabel,
          { color: muted ? theme.textSecondary : theme.text },
        ]}>
        {name}
      </Text>
    </View>
  );
}

/** A horizontal bar, used for point totals on the balance screen. */
export function Bar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const theme = useTheme();
  const width = useMemo(() => {
    if (max <= 0) return 0;
    return Math.max(2, Math.min(100, (value / max) * 100));
  }, [value, max]);

  return (
    <View style={[styles.barTrack, { backgroundColor: theme.backgroundSelected }]}>
      <View
        style={[styles.barFill, { width: `${width}%`, backgroundColor: color }]}
      />
    </View>
  );
}

export function Callout({
  tone,
  title,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'accent';
  title: string;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const background = {
    success: theme.successSoft,
    warning: theme.warningSoft,
    danger: theme.dangerSoft,
    accent: theme.accentSoft,
  }[tone];
  const foreground = {
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
    accent: theme.accent,
  }[tone];

  return (
    <View style={[styles.callout, { backgroundColor: background }]}>
      <Text style={[styles.calloutTitle, { color: foreground }]}>{title}</Text>
      {children ? (
        <Text style={[styles.hint, { color: theme.text }]}>{children}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: Platform.select({ web: Spacing.four, default: Spacing.six }),
    paddingBottom: Spacing.six * 2,
    alignItems: 'center',
  },
  screenInner: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.three,
    flexWrap: 'wrap',
  },
  headerText: { flexShrink: 1, gap: Spacing.half },
  headerActions: { flexDirection: 'row', gap: Spacing.two },
  title: { fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  heading: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  hint: { fontSize: 13, lineHeight: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: Spacing.two,
  },
  card: {
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderRadius: Radius.medium,
    padding: Spacing.four,
  },
  button: {
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { paddingVertical: Spacing.one + 2, paddingHorizontal: Spacing.two },
  buttonLabel: { fontSize: 14, fontWeight: '600' },
  pill: {
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
  },
  pillLabel: { fontSize: 12, fontWeight: '600' },
  pressed: { opacity: 0.7 },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.medium,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: Spacing.one + 3,
    borderRadius: Radius.small + 1,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 13, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepperButton: {
    width: 34,
    height: 34,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { fontSize: 19, fontWeight: '600', lineHeight: 22 },
  stepperValue: { fontSize: 15, fontWeight: '600', minWidth: 54, textAlign: 'center' },
  field: { gap: Spacing.one, flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  toggleText: { flex: 1, gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.pill,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  barTrack: { height: 10, borderRadius: Radius.pill, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: Radius.pill },
  callout: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  calloutTitle: { fontSize: 14, fontWeight: '700' },
});
