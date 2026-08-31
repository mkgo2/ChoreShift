/**
 * The rules the scheduler has to obey.
 *
 * Split into hard rules, which the engine treats as absolute filters, and soft
 * preferences, which only break ties between members who are already allowed.
 * The screen keeps that distinction visible, because it is the difference
 * between "will never happen" and "happens when it can".
 */

import { formatClock, parseClock } from '@choreshift/engine';
import type { ClockRange, Timing, Weekday } from '@choreshift/engine';
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
  Stepper,
  Toggle,
} from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/store/household-store';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export default function RulesScreen() {
  const { household, schedule, dispatch } = useHousehold();
  const rules = household.rules;

  return (
    <Screen
      title="Rules"
      subtitle="Hard rules are never broken. Soft preferences only break ties."
      actions={
        <Button
          label="Reset all"
          tone="danger"
          compact
          onPress={() => dispatch({ type: 'reset' })}
        />
      }>
      {/* ---------------------------------------------------------------- */}
      <SectionLabel>Fairness</SectionLabel>
      <Card>
        <Row>
          <View style={styles.label}>
            <Body>Acceptable point gap</Body>
            <Body muted style={styles.meta}>
              How far apart the heaviest and lightest loads may sit before the
              engine keeps optimising. Currently {schedule.gap}.
            </Body>
          </View>
          <Stepper
            value={rules.balanceTolerance}
            min={0}
            max={20}
            onChange={(balanceTolerance) =>
              dispatch({ type: 'updateRules', rules: { balanceTolerance } })
            }
            suffix="pts"
          />
        </Row>
        <Divider />
        <Toggle
          label="Carry imbalance into the next week"
          hint="Whoever ran heavy starts the following week ahead, so they are handed less."
          value={rules.carryOverPreviousImbalance}
          onValueChange={(carryOverPreviousImbalance) =>
            dispatch({
              type: 'updateRules',
              rules: { carryOverPreviousImbalance },
            })
          }
        />
        <Divider />
        <Row>
          <View style={styles.label}>
            <Body>Default chore length</Body>
            <Body muted style={styles.meta}>
              Used when a chore does not set its own. Somebody needs this much
              uninterrupted time to be offered it.
            </Body>
          </View>
          <Stepper
            value={rules.defaultDurationMinutes}
            min={5}
            max={120}
            step={5}
            onChange={(defaultDurationMinutes) =>
              dispatch({
                type: 'updateRules',
                rules: { defaultDurationMinutes },
              })
            }
            suffix="min"
          />
        </Row>
      </Card>

      {/* ---------------------------------------------------------------- */}
      <SectionLabel>What morning and night mean here</SectionLabel>
      <Card>
        {(['morning', 'night', 'anytime'] as Timing[]).map((timing, index) => (
          <View key={timing}>
            {index > 0 ? <Divider /> : null}
            <TimingRow
              timing={timing}
              range={rules.timingWindows[timing]}
              onChange={(range) =>
                dispatch({
                  type: 'updateRules',
                  rules: {
                    timingWindows: { ...rules.timingWindows, [timing]: range },
                  },
                })
              }
            />
          </View>
        ))}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <SectionLabel>Hard — never broken</SectionLabel>

      <Card>
        <Heading>Chores that cannot share a day</Heading>
        <Body muted style={styles.meta}>
          Two chores that add up to one long shift. The engine will not put both
          on the same person on the same day.
        </Body>
        {rules.taskPairExclusions.length === 0 ? (
          <EmptyState>No pairs set.</EmptyState>
        ) : null}
        {rules.taskPairExclusions.map(([a, b], index) => (
          <Row key={`${a}-${b}-${index}`}>
            {/* Not "+" — chore names contain plus signs ("Kitchen counter + sweep")
                and the pair would read as one chore. */}
            <Body>
              {nameOf(household.tasks, a)} ↮ {nameOf(household.tasks, b)}
            </Body>
            <Button
              label="Remove"
              tone="danger"
              compact
              onPress={() =>
                dispatch({
                  type: 'updateRules',
                  rules: {
                    taskPairExclusions: rules.taskPairExclusions.filter(
                      (_, i) => i !== index,
                    ),
                  },
                })
              }
            />
          </Row>
        ))}
        <PairAdder
          onAdd={(pair) =>
            dispatch({
              type: 'updateRules',
              rules: { taskPairExclusions: [...rules.taskPairExclusions, pair] },
            })
          }
        />
      </Card>

      <Card>
        <Heading>How many people fit in a room</Heading>
        <Body muted style={styles.meta}>
          Applies to chores sharing a space in the same part of the day.
        </Body>
        {rules.coLocationLimits.length === 0 ? (
          <EmptyState>No limits set.</EmptyState>
        ) : null}
        {rules.coLocationLimits.map((limit, index) => (
          <Row key={`${limit.space}-${index}`}>
            <Body>{limit.space}</Body>
            <Row style={styles.tight}>
              <Stepper
                value={limit.maxConcurrent}
                min={1}
                max={8}
                onChange={(maxConcurrent) =>
                  dispatch({
                    type: 'updateRules',
                    rules: {
                      coLocationLimits: rules.coLocationLimits.map((l, i) =>
                        i === index ? { ...l, maxConcurrent } : l,
                      ),
                    },
                  })
                }
              />
              <Button
                label="Remove"
                tone="danger"
                compact
                onPress={() =>
                  dispatch({
                    type: 'updateRules',
                    rules: {
                      coLocationLimits: rules.coLocationLimits.filter(
                        (_, i) => i !== index,
                      ),
                    },
                  })
                }
              />
            </Row>
          </Row>
        ))}
        <SpaceAdder
          onAdd={(space) =>
            dispatch({
              type: 'updateRules',
              rules: {
                coLocationLimits: [
                  ...rules.coLocationLimits,
                  { space, maxConcurrent: 2 },
                ],
              },
            })
          }
        />
      </Card>

      <Card>
        <Heading>Days off</Heading>
        <Body muted style={styles.meta}>
          Nothing is scheduled for this person on the days you highlight.
        </Body>
        {household.members.map((member) => {
          const blackout = rules.blackouts.find((b) => b.memberId === member.id);
          const days = blackout?.weekdays ?? [];
          return (
            <View key={member.id} style={styles.blackoutRow}>
              <Body>{member.name}</Body>
              <DayToggles
                selected={days}
                onToggle={(day) => {
                  const next = days.includes(day)
                    ? days.filter((d) => d !== day)
                    : [...days, day].sort((x, y) => x - y);
                  const others = rules.blackouts.filter(
                    (b) => b.memberId !== member.id,
                  );
                  dispatch({
                    type: 'updateRules',
                    rules: {
                      blackouts:
                        next.length === 0
                          ? others
                          : [...others, { memberId: member.id, weekdays: next }],
                    },
                  });
                }}
              />
            </View>
          );
        })}
      </Card>

      {/* ---------------------------------------------------------------- */}
      <SectionLabel>Soft — only breaks ties</SectionLabel>

      <Card>
        <Heading>Keep a chore with one person</Heading>
        <Body muted style={styles.meta}>
          A nudge, not a rule. Fairness still wins where the two disagree.
        </Body>
        {rules.preferences.length === 0 ? (
          <EmptyState>No preferences set.</EmptyState>
        ) : null}
        {rules.preferences.map((preference, index) => (
          <Row key={`${preference.taskId}-${preference.memberId}-${index}`}>
            <Body>
              {nameOf(household.tasks, preference.taskId)} →{' '}
              {household.members.find((m) => m.id === preference.memberId)?.name ??
                'unknown'}
            </Body>
            <Button
              label="Remove"
              tone="danger"
              compact
              onPress={() =>
                dispatch({
                  type: 'updateRules',
                  rules: {
                    preferences: rules.preferences.filter((_, i) => i !== index),
                  },
                })
              }
            />
          </Row>
        ))}
        <PreferenceAdder
          onAdd={(taskId, memberId) =>
            dispatch({
              type: 'updateRules',
              rules: {
                preferences: [...rules.preferences, { taskId, memberId, weight: 2 }],
              },
            })
          }
        />
      </Card>

      <Card>
        <Heading>Shift the weekend load</Heading>
        <Body muted style={styles.meta}>
          On the days you pick, lean toward whoever is most free that day.
        </Body>
        <DayToggles
          selected={rules.loadShifting[0]?.weekdays ?? []}
          onToggle={(day) => {
            const current = rules.loadShifting[0]?.weekdays ?? [];
            const next = current.includes(day)
              ? current.filter((d) => d !== day)
              : [...current, day].sort((x, y) => x - y);
            dispatch({
              type: 'updateRules',
              rules: {
                loadShifting: next.length === 0 ? [] : [{ weekdays: next, weight: 1 }],
              },
            });
          }}
        />
      </Card>
    </Screen>
  );
}

function nameOf(
  tasks: Array<{ id: string; name: string }>,
  id: string,
): string {
  return tasks.find((t) => t.id === id)?.name ?? id;
}

function TimingRow({
  timing,
  range,
  onChange,
}: {
  timing: Timing;
  range: ClockRange;
  onChange: (range: ClockRange) => void;
}) {
  return (
    <View style={styles.timingRow}>
      <Body style={styles.timingLabel}>{timing}</Body>
      <ClockField
        label="From"
        minutes={range.start}
        onCommit={(start) => onChange({ ...range, start })}
      />
      <ClockField
        label="To"
        minutes={range.end}
        onCommit={(end) => onChange({ ...range, end })}
      />
    </View>
  );
}

function ClockField({
  label,
  minutes,
  onCommit,
}: {
  label: string;
  minutes: number;
  onCommit: (minutes: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Field
      label={label}
      value={draft ?? formatClock(minutes)}
      autoCapitalize="none"
      placeholder="06:00"
      onChangeText={(text) => {
        setDraft(text);
        try {
          onCommit(parseClock(text.trim()));
          setDraft(null);
        } catch {
          // Mid-edit; keep the raw text until it parses.
        }
      }}
    />
  );
}

function DayToggles({
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

/** Two taps: pick a chore, pick the chore it may not share a day with. */
function PairAdder({ onAdd }: { onAdd: (pair: [string, string]) => void }) {
  const { household } = useHousehold();
  const [first, setFirst] = useState<string | null>(null);

  if (household.tasks.length < 2) return null;

  return (
    <View style={styles.adder}>
      <Body muted style={styles.meta}>
        {first
          ? `Now pick what "${nameOf(household.tasks, first)}" may not share a day with.`
          : 'Pick the first chore.'}
      </Body>
      <View style={styles.chipWrap}>
        {household.tasks
          .filter((t) => t.id !== first)
          .map((task) => (
            <Pill
              key={task.id}
              label={task.name}
              selected={false}
              onPress={() => {
                if (!first) {
                  setFirst(task.id);
                } else {
                  onAdd([first, task.id]);
                  setFirst(null);
                }
              }}
            />
          ))}
      </View>
      {first ? <Button label="Cancel" compact onPress={() => setFirst(null)} /> : null}
    </View>
  );
}

function SpaceAdder({ onAdd }: { onAdd: (space: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <Row>
      <Field
        label="Add a space"
        value={value}
        autoCapitalize="none"
        placeholder="kitchen"
        onChangeText={setValue}
      />
      <View style={styles.adderButton}>
        <Button
          label="Add"
          compact
          disabled={value.trim().length === 0}
          onPress={() => {
            onAdd(value.trim());
            setValue('');
          }}
        />
      </View>
    </Row>
  );
}

function PreferenceAdder({
  onAdd,
}: {
  onAdd: (taskId: string, memberId: string) => void;
}) {
  const { household } = useHousehold();
  const [taskId, setTaskId] = useState<string | null>(null);

  if (household.tasks.length === 0 || household.members.length === 0) return null;

  return (
    <View style={styles.adder}>
      <Body muted style={styles.meta}>
        {taskId
          ? `Who should usually do "${nameOf(household.tasks, taskId)}"?`
          : 'Pick a chore to keep with one person.'}
      </Body>
      <View style={styles.chipWrap}>
        {taskId
          ? household.members.map((member) => (
              <Pill
                key={member.id}
                label={member.name}
                onPress={() => {
                  onAdd(taskId, member.id);
                  setTaskId(null);
                }}
              />
            ))
          : household.tasks.map((task) => (
              <Pill key={task.id} label={task.name} onPress={() => setTaskId(task.id)} />
            ))}
      </View>
      {taskId ? <Button label="Cancel" compact onPress={() => setTaskId(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { flex: 1, gap: 2 },
  meta: { fontSize: 13 },
  tight: { gap: Spacing.two, flexShrink: 0 },
  timingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  timingLabel: { width: 72, textTransform: 'capitalize' },
  blackoutRow: { gap: Spacing.one, paddingVertical: Spacing.one },
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
  adder: { gap: Spacing.two, marginTop: Spacing.one },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  adderButton: { justifyContent: 'flex-end', paddingBottom: 2 },
});
