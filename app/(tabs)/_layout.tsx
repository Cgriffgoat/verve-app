import { Tabs } from 'expo-router';

const CORAL = '#FF5C5C';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: CORAL,
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#F0F0F0',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarLabel: 'Today' }}
      />
      <Tabs.Screen
        name="explore"
        options={{ tabBarLabel: 'Explore' }}
      />
      <Tabs.Screen
        name="saved"
        options={{ tabBarLabel: 'Saved' }}
      />
      <Tabs.Screen
        name="been-there"
        options={{ tabBarLabel: 'Been There' }}
      />
    </Tabs>
  );
}
