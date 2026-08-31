import { DarkTheme, DefaultTheme, Tabs, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { HouseholdProvider } from '@/store/household-store';

/**
 * Five tabs, matching the five things a household actually does: look at the
 * week, check the split is fair, manage the chores, manage the people, and set
 * the rules the scheduler has to obey.
 */
const TABS: Array<{ name: string; title: string; glyph: string }> = [
  { name: 'index', title: 'Week', glyph: '🗓' },
  { name: 'balance', title: 'Balance', glyph: '⚖️' },
  { name: 'tasks', title: 'Tasks', glyph: '🧽' },
  { name: 'household', title: 'People', glyph: '👥' },
  { name: 'rules', title: 'Rules', glyph: '⚙️' },
];

export default function RootLayout() {
  const scheme = useColorScheme();
  const mode = scheme === 'dark' ? 'dark' : 'light';
  const colors = Colors[mode];

  return (
    <ThemeProvider value={mode === 'dark' ? DarkTheme : DefaultTheme}>
      <HouseholdProvider>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textSecondary,
            tabBarStyle: {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
            tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
            sceneStyle: { backgroundColor: colors.background },
          }}>
          {TABS.map((tab) => (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: tab.title,
                tabBarIcon: ({ focused }) => (
                  <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>
                    {tab.glyph}
                  </Text>
                ),
              }}
            />
          ))}
        </Tabs>
      </HouseholdProvider>
    </ThemeProvider>
  );
}
