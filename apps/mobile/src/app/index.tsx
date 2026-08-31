/**
 * The week.
 *
 * Every task instance the engine placed, grouped by day. Tapping one opens the
 * reassignment row, which shows who is actually free for that slot — members
 * who cannot take it are shown as unavailable rather than hidden, so the reason
 * a name is missing is always visible.
 */

import {
  canWork,
  datesInRange,
  isBlackedOut,
  weekdayName,
  weekdayOf,
} from '@choreshift/engine';
import type { Assignment, ISODate, Member, SwapRequest, Task } from '@choreshift/engine';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Body,
  Button,
  Callout,
  Card,
  Divider,
  EmptyState,
  Heading,
  MemberChip,
  Pill,
  Row,
  Screen,
  memberColor,
} from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { mondayOf, useHousehold } from '@/store/household-store';

function shortDate(date: ISODate): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export default function WeekScreen() {
  const theme = useTheme();
  const {
    household,
    schedule,
    weekStart,
    weekEnd,
    dispatch,
    assignTo,
    isPinned,
    openRequests,
    claimRequest,
    escalateRequest,
    respondToEscalation,
    cancelRequest,
    isRequestExpired,
  } = useHousehold();
  const [openInstance, setOpenInstance] = useState<string | null>(null);

  const tasksById = useMemo(
    () => new Map(household.tasks.map((t) => [t.id, t])),
    [household.tasks],
  );
  const membersById = useMemo(
    () => new Map(household.members.map((m) => [m.id, m])),
    [household.members],
  );

  const days = useMemo(() => datesInRange(weekStart, weekEnd), [weekStart, weekEnd]);

  const byDate = useMemo(() => {
    const map = new Map<ISODate, Assignment[]>();
    for (const a of schedule.assignments) {
      map.set(a.date, [...(map.get(a.date) ?? []), a]);
    }
    return map;
  }, [schedule.assignments]);

  const groupByDate = useMemo(() => {
    const map = new Map<ISODate, Task[]>();
    for (const instance of schedule.groupInstances) {
      const task = tasksById.get(instance.taskId);
      if (task) map.set(instance.date, [...(map.get(instance.date) ?? []), task]);
    }
    return map;
  }, [schedule.groupInstances, tasksById]);

  const unassignedByDate = useMemo(() => {
    const map = new Map<ISODate, typeof schedule.unassigned>();
    for (const u of schedule.unassigned) {
      map.set(u.instance.date, [...(map.get(u.instance.date) ?? []), u]);
    }
    return map;
  }, [schedule.unassigned]);

  const pinnedCount = schedule.assignments.filter((a) => isPinned(a.instanceId)).length;

  const requestsByInstance = useMemo(
    () => new Map(openRequests.map((r) => [r.instanceId, r])),
    [openRequests],
  );

  return (
    <Screen
      title="This week"
      subtitle={`${shortDate(weekStart)} – ${shortDate(weekEnd)} · ${
        schedule.assignments.length
      } chores · gap ${Math.round(schedule.gap * 10) / 10} pts`}
      actions={
        <Button
          label="Regenerate"
          tone="accent"
          compact
          onPress={() => dispatch({ type: 'regenerate' })}
        />
      }>
      <Row>
        <Button
          label="◀ Previous"
          compact
          onPress={() => dispatch({ type: 'shiftWeek', days: -7 })}
        />
        <Button
          label="Today"
          compact
          onPress={() =>
            dispatch({
              type: 'setWeekStart',
              weekStart: mondayOf(new Date().toISOString().slice(0, 10)),
            })
          }
        />
        <Button
          label="Next ▶"
          compact
          onPress={() => dispatch({ type: 'shiftWeek', days: 7 })}
        />
      </Row>

      {schedule.unassigned.length > 0 ? (
        <Callout tone="danger" title={`${schedule.unassigned.length} unplaced`}>
          Nobody in the household can take these. They are listed on the day they
          fall, with the reason.
        </Callout>
      ) : null}

      {pinnedCount > 0 ? (
        <Row>
          <Body muted>
            {pinnedCount} pinned {pinnedCount === 1 ? 'chore stays' : 'chores stay'} put
            when you regenerate.
          </Body>
          <Button
            label="Unpin all"
            compact
            onPress={() => dispatch({ type: 'clearPins' })}
          />
        </Row>
      ) : null}

      {openRequests.length > 0 ? (
        <Callout
          tone="warning"
          title={`${openRequests.length} ${
            openRequests.length === 1 ? 'chore needs' : 'chores need'
          } coverage`}>
          Somebody called out. Marked below on the day it falls — claim one if
          you can take it.
        </Callout>
      ) : null}

      {days.map((date) => {
        const assignments = byDate.get(date) ?? [];
        const groups = groupByDate.get(date) ?? [];
        const unplaced = unassignedByDate.get(date) ?? [];
        const isToday = date === new Date().toISOString().slice(0, 10);

        return (
          <View key={date} style={styles.day}>
            <Row>
              <Heading>
                {weekdayName(weekdayOf(date))} {shortDate(date)}
              </Heading>
              {isToday ? <Pill label="Today" selected /> : null}
            </Row>

            {assignments.length === 0 && groups.length === 0 && unplaced.length === 0 ? (
              <EmptyState>Nothing scheduled.</EmptyState>
            ) : null}

            {assignments.map((assignment) => {
              const task = tasksById.get(assignment.taskId);
              const member = membersById.get(assignment.memberId);
              if (!task) return null;
              const open = openInstance === assignment.instanceId;
              const pinned = isPinned(assignment.instanceId);
              const request = requestsByInstance.get(assignment.instanceId);

              return (
                <View key={assignment.instanceId} style={styles.assignmentGroup}>
                <Card>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      setOpenInstance(open ? null : assignment.instanceId)
                    }>
                    <Row>
                      <View style={styles.taskText}>
                        <Body>{task.name}</Body>
                        <Body muted style={styles.meta}>
                          {task.timing} · {task.points} pt
                          {task.points === 1 ? '' : 's'}
                          {task.space ? ` · ${task.space}` : ''}
                        </Body>
                      </View>
                      <View style={styles.assignee}>
                        {request ? (
                          <Pill
                            label="Up for grabs"
                            background={theme.warningSoft}
                            color={theme.warning}
                          />
                        ) : pinned ? (
                          <Pill label="Pinned" selected />
                        ) : null}
                        {member ? (
                          <MemberChip
                            id={member.id}
                            name={member.name}
                            {...(member.color ? { color: member.color } : {})}
                          />
                        ) : (
                          <Pill label="Unknown" />
                        )}
                      </View>
                    </Row>
                  </Pressable>

                  {open ? (
                    <>
                      <Divider />
                      <ReassignRow
                        assignment={assignment}
                        task={task}
                        onPick={(memberId) => {
                          assignTo(
                            assignment.instanceId,
                            assignment.taskId,
                            assignment.date,
                            memberId,
                          );
                          setOpenInstance(null);
                        }}
                        onUnpin={() => {
                          dispatch({
                            type: 'unpin',
                            instanceId: assignment.instanceId,
                          });
                          setOpenInstance(null);
                        }}
                        pinned={pinned}
                      />
                    </>
                  ) : null}
                </Card>
                {request ? (
                  <CoverageRequestCard request={request} task={task} date={assignment.date} />
                ) : null}
                </View>
              );
            })}

            {groups.map((task) => (
              <Card key={`${task.id}@${date}`}>
                <Row>
                  <View style={styles.taskText}>
                    <Body>{task.name}</Body>
                    <Body muted style={styles.meta}>
                      Everyone together · no points
                    </Body>
                  </View>
                  <Pill label="Group" background={theme.accentSoft} color={theme.accent} />
                </Row>
              </Card>
            ))}

            {unplaced.map((u) => (
              <Card
                key={u.instance.id}
                style={{ borderColor: theme.danger, backgroundColor: theme.dangerSoft }}>
                <Body>{u.taskName}</Body>
                <Body muted style={styles.meta}>
                  {u.detail}
                </Body>
              </Card>
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

/**
 * The reassignment row.
 *
 * Members who cannot do this task at this time are still listed, greyed out and
 * unpressable. Showing why somebody is not an option is more useful than
 * quietly leaving them out.
 */
function ReassignRow({
  assignment,
  task,
  pinned,
  onPick,
  onUnpin,
}: {
  assignment: Assignment;
  task: Task;
  pinned: boolean;
  onPick: (memberId: string) => void;
  onUnpin: () => void;
}) {
  const theme = useTheme();
  const { household } = useHousehold();

  const options = household.members.map((member: Member) => {
    const free =
      !member.paused &&
      canWork(
        member,
        task,
        assignment.date,
        household.rules.timingWindows,
        household.rules.defaultDurationMinutes,
      ) &&
      !isBlackedOut(household.rules.blackouts, member.id, assignment.date);
    return { member, free };
  });

  return (
    <View style={styles.reassign}>
      <Body muted style={styles.meta}>
        Reassign — pinning keeps it here when you regenerate
      </Body>
      <View style={styles.optionRow}>
        {options.map(({ member, free }) => {
          const selected = member.id === assignment.memberId;
          return (
            <Pressable
              key={member.id}
              accessibilityRole="button"
              accessibilityState={{ disabled: !free, selected }}
              disabled={!free}
              onPress={() => onPick(member.id)}
              style={[
                styles.option,
                {
                  borderColor: selected ? theme.accent : theme.border,
                  backgroundColor: selected ? theme.accentSoft : theme.background,
                  opacity: free ? 1 : 0.4,
                },
              ]}>
              <View
                style={[
                  styles.optionDot,
                  { backgroundColor: memberColor(member.id, member.color) },
                ]}
              />
              <Body style={styles.optionLabel}>{member.name}</Body>
              {!free ? (
                <Body muted style={styles.optionNote}>
                  {member.paused ? 'paused' : 'not free'}
                </Body>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {pinned ? (
        <Button label="Unpin — let the scheduler decide" compact onPress={onUnpin} />
      ) : null}
    </View>
  );
}

/**
 * The coverage-request card under an "up for grabs" assignment.
 *
 * Open first, to anyone: any eligible member can claim it and it is theirs.
 * Past the household's coverage window with nobody claiming it, the
 * caller-out has to name a specific person — and that person still has to
 * tap Approve before anything moves. Nothing here is silent or automatic.
 */
function CoverageRequestCard({
  request,
  task,
  date,
}: {
  request: SwapRequest;
  task: Task;
  date: ISODate;
}) {
  const theme = useTheme();
  const {
    household,
    claimRequest,
    escalateRequest,
    respondToEscalation,
    cancelRequest,
    isRequestExpired,
  } = useHousehold();
  const [problem, setProblem] = useState<string | null>(null);

  const membersById = useMemo(
    () => new Map(household.members.map((m) => [m.id, m])),
    [household.members],
  );
  const from = membersById.get(request.fromMemberId);
  const others = household.members.filter((m) => m.id !== request.fromMemberId);
  const expired = isRequestExpired(request);

  function report(result: { ok: boolean; problems: string[] }) {
    setProblem(result.ok ? null : result.problems.join(' '));
  }

  return (
    <Card style={{ borderColor: theme.warning, backgroundColor: theme.warningSoft }}>
      <Row>
        <Body style={styles.meta}>
          {from?.name ?? 'Someone'} called out — {task.name} on {date} needs
          someone else.
        </Body>
        <Button
          label="Cancel"
          compact
          tone="danger"
          onPress={() => cancelRequest(request.id)}
        />
      </Row>

      {problem ? (
        <Body muted style={[styles.meta, { color: theme.danger }]}>
          {problem}
        </Body>
      ) : null}

      {request.toMemberId ? (
        <>
          <Body muted style={styles.meta}>
            Waiting on {membersById.get(request.toMemberId)?.name ?? 'them'} to
            accept — nothing moves until they do.
          </Body>
          <Row>
            <Button
              label="Approve"
              tone="accent"
              compact
              onPress={() => report(respondToEscalation(request.id, true))}
            />
            <Button
              label="Decline"
              compact
              onPress={() => report(respondToEscalation(request.id, false))}
            />
          </Row>
        </>
      ) : expired ? (
        <>
          <Body muted style={styles.meta}>
            Nobody claimed it. Pick someone to swap with — they still have to
            accept before it's theirs.
          </Body>
          <View style={styles.chipWrap}>
            {others.map((m) => (
              <Pill key={m.id} label={m.name} onPress={() => escalateRequest(request.id, m.id)} />
            ))}
          </View>
        </>
      ) : (
        <>
          <Body muted style={styles.meta}>
            Open to the household — first to claim it takes it.
          </Body>
          <View style={styles.chipWrap}>
            {others.map((m) => (
              <Pill
                key={m.id}
                label={m.name}
                onPress={() => report(claimRequest(request.id, m.id))}
              />
            ))}
          </View>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  day: { gap: Spacing.two, marginTop: Spacing.two },
  assignmentGroup: { gap: Spacing.two },
  taskText: { flexShrink: 1, gap: 2 },
  meta: { fontSize: 13 },
  assignee: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  reassign: { gap: Spacing.two },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionDot: { width: 8, height: 8, borderRadius: 4 },
  optionLabel: { fontSize: 14 },
  optionNote: { fontSize: 12 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
});
