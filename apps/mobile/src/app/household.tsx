/**
 * People and when they are free.
 *
 * Availability is the input the whole engine turns on, so it gets a proper
 * editor rather than a settings sub-page: weekly windows per member, plus a
 * pause switch for the weeks somebody is away.
 */

import { formatClock, parseClock } from '@choreshift/engine';
import type { AvailabilityWindow, Member, Weekday } from '@choreshift/engine';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Body,
  Button,
  Card,
  Divider,
  EmptyState,
  Field,
  Heading,
  MemberChip,
  Pill,
  Row,
  Screen,
  SectionLabel,
  Segmented,
  Toggle,
} from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/store/household-store';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Free hours per week, the quickest read on whether someone can carry a share. */
function weeklyHours(member: Member): number {
  const minutes = member.windows.reduce((sum, w) => sum + (w.end - w.start), 0);
  return Math.round((minutes / 60) * 10) / 10;
}

export default function HouseholdScreen() {
  const { household, schedule, dispatch } = useHousehold();
  const [editing, setEditing] = useState<string | null>(null);

  function addMember() {
    const member: Member = {
      id: `member-${Date.now().toString(36)}`,
      name: 'New member',
      role: 'member',
      windows: [
        { weekday: 1, start: parseClock('18:00'), end: parseClock('22:00') },
      ],
      exceptions: [],
      paused: false,
    };
    dispatch({ type: 'upsertMember', member });
    setEditing(member.id);
  }

  const active = household.members.filter((m) => !m.paused).length;

  return (
    <Screen
      title="People"
      subtitle={`${household.members.length} in the household · ${active} scheduling this week`}
      actions={<Button label="Add person" tone="accent" compact onPress={addMember} />}>
      {household.members.length === 0 ? (
        <EmptyState>
          Nobody here yet. Add the people who share the chores, then give each of
          them the hours they are actually free.
        </EmptyState>
      ) : null}

      {household.members.map((member) => {
        const points =
          schedule.balance.find((b) => b.memberId === member.id)?.points ?? 0;
        return (
          <Card key={member.id}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setEditing(editing === member.id ? null : member.id)}>
              <Row>
                <View style={styles.titleCol}>
                  <MemberChip
                    id={member.id}
                    name={member.name}
                    {...(member.color ? { color: member.color } : {})}
                  />
                  <Body muted style={styles.meta}>
                    {member.role} · {weeklyHours(member)}h free a week ·{' '}
                    {member.windows.length}{' '}
                    {member.windows.length === 1 ? 'window' : 'windows'}
                  </Body>
                </View>
                <View style={styles.rightCol}>
                  {member.paused ? (
                    <Pill label="Paused" />
                  ) : (
                    <Pill label={`${Math.round(points * 10) / 10} pts`} selected />
                  )}
                </View>
              </Row>
            </Pressable>

            {editing === member.id ? (
              <>
                <Divider />
                <MemberEditor
                  member={member}
                  onChange={(next) => dispatch({ type: 'upsertMember', member: next })}
                  onDelete={() => {
                    dispatch({ type: 'removeMember', memberId: member.id });
                    setEditing(null);
                  }}
                />
              </>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}

function MemberEditor({
  member,
  onChange,
  onDelete,
}: {
  member: Member;
  onChange: (member: Member) => void;
  onDelete: () => void;
}) {
  function setWindow(index: number, next: AvailabilityWindow) {
    onChange({
      ...member,
      windows: member.windows.map((w, i) => (i === index ? next : w)),
    });
  }

  function removeWindow(index: number) {
    onChange({ ...member, windows: member.windows.filter((_, i) => i !== index) });
  }

  function addWindow() {
    onChange({
      ...member,
      windows: [
        ...member.windows,
        { weekday: 1, start: parseClock('18:00'), end: parseClock('21:00') },
      ],
    });
  }

  return (
    <View style={styles.editor}>
      <Field
        label="Name"
        value={member.name}
        onChangeText={(name) => onChange({ ...member, name })}
      />

      <SectionLabel>Role</SectionLabel>
      <Segmented
        options={[
          { value: 'admin', label: 'Admin' },
          { value: 'member', label: 'Member' },
        ]}
        value={member.role}
        onChange={(role) => onChange({ ...member, role })}
      />

      <Toggle
        label="Paused"
        hint="Skipped entirely by the scheduler — for travel, illness, a heavy week."
        value={member.paused}
        onValueChange={(paused) => onChange({ ...member, paused })}
      />

      <SectionLabel>Availability</SectionLabel>
      <Body muted style={styles.meta}>
        A chore is only ever offered to someone free for the whole of it, inside
        the window its timing requires.
      </Body>

      {member.windows.length === 0 ? (
        <EmptyState>
          No hours set, so this person can never be assigned anything.
        </EmptyState>
      ) : null}

      {member.windows.map((window, index) => (
        <WindowRow
          key={`${window.weekday}-${window.start}-${window.end}-${index}`}
          window={window}
          onChange={(next) => setWindow(index, next)}
          onRemove={() => removeWindow(index)}
        />
      ))}

      <Button label="Add a window" onPress={addWindow} />
      <Button label="Remove person" tone="danger" onPress={onDelete} />
    </View>
  );
}

function WindowRow({
  window,
  onChange,
  onRemove,
}: {
  window: AvailabilityWindow;
  onChange: (window: AvailabilityWindow) => void;
  onRemove: () => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.windowCard, { borderColor: theme.border }]}>
      <View style={styles.dayRow}>
        {DAY_INITIALS.map((initial, index) => {
          const day = index as Weekday;
          const active = window.weekday === day;
          return (
            <Pressable
              key={`${initial}-${index}`}
              accessibilityRole="button"
              accessibilityLabel={DAY_NAMES[index]}
              accessibilityState={{ selected: active }}
              onPress={() => onChange({ ...window, weekday: day })}
              style={[
                styles.dayButton,
                {
                  backgroundColor: active ? theme.accent : theme.backgroundSelected,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <Body style={{ color: active ? '#ffffff' : theme.textSecondary }}>
                {initial}
              </Body>
            </Pressable>
          );
        })}
      </View>

      <Row>
        <TimeField
          label="From"
          minutes={window.start}
          onCommit={(start) => onChange({ ...window, start })}
        />
        <TimeField
          label="To"
          minutes={window.end}
          onCommit={(end) => onChange({ ...window, end })}
        />
        <View style={styles.removeCol}>
          <Button label="Remove" tone="danger" compact onPress={onRemove} />
        </View>
      </Row>
    </View>
  );
}

/**
 * A HH:MM input that keeps whatever is typed and only commits when it parses.
 *
 * Committing on every keystroke would destroy the value the moment somebody
 * deletes a digit, so partial input is held locally instead.
 */
function TimeField({
  label,
  minutes,
  onCommit,
}: {
  label: string;
  minutes: number;
  onCommit: (minutes: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? formatClock(minutes);

  return (
    <Field
      label={label}
      value={shown}
      autoCapitalize="none"
      placeholder="18:00"
      onChangeText={(text) => {
        setDraft(text);
        try {
          const parsed = parseClock(text.trim());
          onCommit(parsed);
          setDraft(null);
        } catch {
          // Still mid-edit — hold the text and wait for something valid.
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  titleCol: { flexShrink: 1, gap: Spacing.one },
  rightCol: { alignItems: 'flex-end' },
  meta: { fontSize: 13 },
  editor: { gap: Spacing.two },
  windowCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.medium,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  dayRow: { flexDirection: 'row', gap: Spacing.one + 2 },
  dayButton: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 36,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeCol: { justifyContent: 'flex-end', paddingBottom: 2 },
});
