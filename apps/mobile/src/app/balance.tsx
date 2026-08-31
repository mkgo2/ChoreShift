/**
 * The balance view — the screen the whole app is arguing for.
 *
 * Points, not chore counts. The bars are the honest answer to "is this fair?",
 * and the gap against the household's tolerance is the number to watch.
 */

import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Bar,
  Body,
  Callout,
  Card,
  Divider,
  EmptyState,
  Heading,
  Pill,
  Row,
  Screen,
  SectionLabel,
  memberColor,
} from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHousehold } from '@/store/household-store';

export default function BalanceScreen() {
  const theme = useTheme();
  const { household, schedule } = useHousehold();

  const rows = useMemo(() => {
    const active = new Set(
      household.members.filter((m) => !m.paused).map((m) => m.id),
    );
    return schedule.balance
      .map((entry) => {
        const member = household.members.find((m) => m.id === entry.memberId);
        return {
          ...entry,
          paused: !active.has(entry.memberId),
          color: memberColor(entry.memberId, member?.color),
        };
      })
      .sort((a, b) => b.points - a.points);
  }, [schedule.balance, household.members]);

  const max = Math.max(1, ...rows.map((r) => r.points));
  // Carry-over offsets are fractional, so the sum needs rounding before it is
  // shown — otherwise 55 renders as 54.99999999999999.
  const totalPoints = round(rows.reduce((sum, r) => sum + Math.max(0, r.points), 0));
  const tolerance = household.rules.balanceTolerance;

  return (
    <Screen
      title="Balance"
      subtitle={`${totalPoints} points of effort across ${rows.filter((r) => !r.paused).length} people`}>
      {schedule.withinTolerance ? (
        <Callout tone="success" title={`Even — ${schedule.gap} point gap`}>
          Nobody is carrying more than {tolerance} points beyond anyone else. This
          is what a fair week looks like.
        </Callout>
      ) : (
        <Callout tone="warning" title={`${schedule.gap} point gap`}>
          Wider than the {tolerance}-point tolerance. Usually this means
          availability is too tight to split evenly — check the Rules tab, or
          widen someone&apos;s hours on the People tab.
        </Callout>
      )}

      <SectionLabel>Effort per person</SectionLabel>
      {rows.map((row) => (
        <Card key={row.memberId}>
          <Row>
            <View style={styles.nameCol}>
              <Heading>{row.name}</Heading>
              <Body muted style={styles.meta}>
                {row.taskCount} {row.taskCount === 1 ? 'chore' : 'chores'}
                {row.carriedOver !== 0
                  ? ` · ${row.carriedOver > 0 ? '+' : ''}${round(row.carriedOver)} carried over`
                  : ''}
              </Body>
            </View>
            <View style={styles.pointsCol}>
              <Heading>{round(row.points)}</Heading>
              {row.paused ? <Pill label="Paused" /> : null}
            </View>
          </Row>
          <Bar value={Math.max(0, row.points)} max={max} color={row.color} />
        </Card>
      ))}

      {rows.length === 0 ? (
        <EmptyState>No members yet. Add people on the People tab.</EmptyState>
      ) : null}

      <SectionLabel>Why the totals differ from the chore count</SectionLabel>
      <Card>
        <Body muted>
          A mop is worth 4 and taking the garbage out is worth 2, so three chores
          can be more work than five. The scheduler balances the left-hand number
          — the points — and lets the chore count fall where it may.
        </Body>
      </Card>

      {schedule.unassigned.length > 0 ? (
        <>
          <SectionLabel>Nobody could take these</SectionLabel>
          <Card style={{ borderColor: theme.danger }}>
            {schedule.unassigned.map((u, index) => (
              <View key={u.instance.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.unassigned}>
                  <Body>
                    {u.taskName} — {u.instance.date}
                  </Body>
                  <Body muted style={styles.meta}>
                    {u.detail}
                  </Body>
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  nameCol: { flexShrink: 1, gap: 2 },
  pointsCol: { alignItems: 'flex-end', gap: Spacing.one },
  meta: { fontSize: 13 },
  unassigned: { paddingVertical: Spacing.one + 2, gap: 2 },
});
