import { Tabs } from 'expo-router';
import { ColorValue } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// tabBarIcon do expo-router entrega `color: ColorValue` (tipo mais amplo
// do RN, cobre objetos de cor de plataforma além de string), não `string`.
function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <MaterialCommunityIcons name={name} size={24} color={color} />;
}

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder },
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text, fontWeight: '700' },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Hoje',
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: 'Remédios',
          tabBarIcon: ({ color }) => <TabIcon name="pill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color }) => <TabIcon name="clipboard-text-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: 'Estoque',
          tabBarIcon: ({ color }) => <TabIcon name="package-variant-closed" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfis',
          tabBarIcon: ({ color }) => <TabIcon name="account-group-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
