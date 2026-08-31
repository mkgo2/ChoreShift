/**
 * Task management.
 *
 * The point value is the important field on this screen: it is what fairness is
 * measured in, so the editor puts it next to the name rather than burying it in
 * an "advanced" section.
 */

import type { Recurrence, Task, Timing, Weekday } from '@choreshift/engine';
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
  Pill,
  Row,
  Screen,
  SectionLabel,
  Segmented,
  Stepper,
  Toggle,
} from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/store/household-store';

/** Single letters fit the day picker buttons. */
const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

/** Prose needs the unambiguous form — "M T" could be Monday and either Tuesday
 *  or Thursday, which is exactly the kind of guess a chore app should not ask
 *  anyone to make. */
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const TIMING_OPTIONS: Array<{ value: Timing; label: string }> = [
  { value: 'morning', label: 'Morning' },
  { value: 'night', label: 'Night' },
  { value: 'anytime', label: 'Anytime' },
];

const RECURRENCE_OPTIONS: Array<{ value: Recurrence['kind']; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Days' },
  { value: 'everyNDays', label: 'Every N' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'once', label: 'Once' },
];

function describeRecurrence(recurrence: Recurrence): string {
  switch (recurrence.kind) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return recurrence.days.length
        ? recurrence.days.map((d) => DAY_SHORT[d]).join(', ')
        : 'No days chosen';
    case 'everyNDays':
      return `Every ${recurrence.n} days`;
    case 'biweekly':
      return `Every other week · ${recurrence.days.map((d) => DAY_SHORT[d]).join(', ')}`;
    case 'once':
      return `Once on ${recurrence.date}`;
    default:
      return '';
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultRecurrence(kind: Recurrence['kind']): Recurrence {
  switch (kind) {
    case 'daily':
      return { kind: 'daily' };
    case 'weekdays':
      return { kind: 'weekdays', days: [1] };
    case 'everyNDays':
      return { kind: 'everyNDays', n: 2, anchor: todayISO() };
    case 'biweekly':
      return { kind: 'biweekly', days: [0], anchor: todayISO() };
    case 'once':
      return { kind: 'once', date: todayISO() };
    default:
      return { kind: 'daily' };
  }
}

export default function TasksScreen() {
  const { household, dispatch } = useHousehold();
  const [editing, setEditing] = useState<string | null>(null);

  function addTask() {
    const task: Task = {
      id: `task-${Date.now().toString(36)}`,
      name: 'New chore',
      points: 2,
      timing: 'anytime',
      recurrence: { kind: 'weekdays', days: [1] },
      durationMinutes: 15,
    };
    dispatch({ type: 'upsertTask', task });
    setEditing(task.id);
  }

  const totalWeeklyPoints = household.tasks
    .filter((t) => !t.groupTask)
    .reduce((sum, t) => sum + t.points, 0);

  return (
    <Screen
      title="Tasks"
      subtitle={`${household.tasks.length} chores · ${totalWeeklyPoints} points per full round`}
      actions={<Button label="Add chore" tone="accent" compact onPress={addTask} />}>
      {household.tasks.length === 0 ? (
        <EmptyState>
          No chores yet. Add one — give it a point value that reflects how much
          work it really is.
        </EmptyState>
      ) : null}

      {household.tasks.map((task) => (
        <Card key={task.id}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setEditing(editing === task.id ? null : task.id)}>
            <Row>
              <View style={styles.titleCol}>
                <Heading>{task.name}</Heading>
                <Body muted style={styles.meta}>
                  {describeRecurrence(task.recurrence)} · {task.timing}
                  {task.space ? ` · ${task.space}` : ''}
                </Body>
              </View>
              <View style={styles.pointsCol}>
                {task.groupTask ? (
                  <Pill label="Group" selected />
                ) : (
                  <Pill label={`${task.points} pts`} />
                )}
              </View>
            </Row>
          </Pressable>

          {editing === task.id ? (
            <>
              <Divider />
              <TaskEditor
                task={task}
                onChange={(next) => dispatch({ type: 'upsertTask', task: next })}
                onDelete={() => {
                  dispatch({ type: 'removeTask', taskId: task.id });
                  setEditing(null);
                }}
              />
            </>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

function TaskEditor({
  task,
  onChange,
  onDelete,
}: {
  task: Task;
  onChange: (task: Task) => void;
  onDelete: () => void;
}) {
  const recurrence = task.recurrence;

  function setRecurrence(next: Recurrence) {
    onChange({ ...task, recurrence: next });
  }

  function toggleDay(day: Weekday) {
    if (recurrence.kind !== 'weekdays' && recurrence.kind !== 'biweekly') return;
    const has = recurrence.days.includes(day);
    const days = has
      ? recurrence.days.filter((d) => d !== day)
      : [...recurrence.days, day].sort((a, b) => a - b);
    setRecurrence({ ...recurrence, days });
  }

  return (
    <View style={styles.editor}>
      <Field
        label="Name"
        value={task.name}
        onChangeText={(name) => onChange({ ...task, name })}
      />

      <Row>
        <View style={styles.half}>
          <SectionLabel>Effort</SectionLabel>
          <Stepper
            value={task.points}
            min={0}
            max={20}
            onChange={(points) => onChange({ ...task, points })}
            suffix="pts"
          />
        </View>
        <View style={styles.half}>
          <SectionLabel>Takes</SectionLabel>
          <Stepper
            value={task.durationMinutes ?? 15}
            min={5}
            max={180}
            step={5}
            onChange={(durationMinutes) => onChange({ ...task, durationMinutes })}
            suffix="min"
          />
        </View>
      </Row>

      <SectionLabel>When during the day</SectionLabel>
      <Segmented
        options={TIMING_OPTIONS}
        value={task.timing}
        onChange={(timing) => onChange({ ...task, timing })}
      />

      <SectionLabel>How often</SectionLabel>
      <Segmented
        options={RECURRENCE_OPTIONS}
        value={recurrence.kind}
        onChange={(kind) => setRecurrence(defaultRecurrence(kind))}
      />

      {recurrence.kind === 'weekdays' || recurrence.kind === 'biweekly' ? (
        <DayPicker selected={recurrence.days} onToggle={toggleDay} />
      ) : null}

      {recurrence.kind === 'everyNDays' ? (
        <Row>
          <Body muted>Repeat every</Body>
          <Stepper
            value={recurrence.n}
            min={1}
            max={30}
            onChange={(n) => setRecurrence({ ...recurrence, n })}
            suffix="days"
          />
        </Row>
      ) : null}

      {recurrence.kind === 'everyNDays' || recurrence.kind === 'biweekly' ? (
        <Field
          label="Counting from"
          value={recurrence.anchor}
          autoCapitalize="none"
          placeholder="YYYY-MM-DD"
          onChangeText={(anchor) => setRecurrence({ ...recurrence, anchor })}
        />
      ) : null}

      {recurrence.kind === 'once' ? (
        <Field
          label="Date"
          value={recurrence.date}
          autoCapitalize="none"
          placeholder="YYYY-MM-DD"
          onChangeText={(date) => setRecurrence({ kind: 'once', date })}
        />
      ) : null}

      <Field
        label="Room or space (used by co-location limits)"
        value={task.space ?? ''}
        autoCapitalize="none"
        placeholder="kitchen"
        onChangeText={(space) =>
          onChange({ ...task, ...(space ? { space } : { space: undefined }) })
        }
      />

      <Toggle
        label="Everyone does this together"
        hint="Group chores are worth no points and are left out of balancing."
        value={task.groupTask === true}
        onValueChange={(groupTask) => onChange({ ...task, groupTask })}
      />

      <Toggle
        label="Active"
        hint="Switch off to keep the chore but stop scheduling it."
        value={task.active !== false}
        onValueChange={(active) => onChange({ ...task, active })}
      />

      <Button label="Delete chore" tone="danger" onPress={onDelete} />
    </View>
  );
}

function DayPicker({
  selected,
  onToggle,
}: {
  selected: Weekday[];
  onToggle: (day: Weekday) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.dayRow}>
      {DAY_INITIALS.map((initial, index) => {
        const day = index as Weekday;
        const active = selected.includes(day);
        return (
          <Pressable
            key={`${initial}-${index}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onToggle(day)}
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
  );
}

const styles = StyleSheet.create({
  titleCol: { flexShrink: 1, gap: 2 },
  pointsCol: { alignItems: 'flex-end' },
  meta: { fontSize: 13 },
  editor: { gap: Spacing.two },
  half: { flex: 1, gap: Spacing.one },
  dayRow: { flexDirection: 'row', gap: Spacing.one + 2 },
  dayButton: {
    flex: 1,
    aspectRatio: 1,
    maxHeight: 40,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
