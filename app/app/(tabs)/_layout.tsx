import { Tabs } from 'expo-router';
import { ColorValue, Platform, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/useTheme';
import { useIsWideScreen } from '../../hooks/useBreakpoint';
import WebTopNav from '../../components/WebTopNav';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// tabBarIcon do expo-router entrega `color: ColorValue` (tipo mais amplo
// do RN, cobre objetos de cor de plataforma além de string), não `string`.
function TabIcon({ name, color }: { name: IconName; color: ColorValue }) {
  return <MaterialCommunityIcons name={name} size={24} color={color} />;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  // Shell web W1 (2026-08-22): em telas largas o navegador recebe navbar
  // superior (WebTopNav) e a tab bar inferior some — é a navegação, mais
  // que a largura, que faz o usuário ler isto como site. Mobile/nativo
  // continua exatamente como era.
  const isWide = useIsWideScreen();
  const showWebShell = Platform.OS === 'web' && isWide;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {showWebShell && <WebTopNav />}
      {/* W1 web: o SCROLLER é full-bleed (barra de rolagem encosta na
          borda da janela, como todo site); quem fica limitado a 960px é
          o CONTEÚDO, via contentContainerStyle de cada tela. */}
      <View style={showWebShell ? { flex: 1, width: '100%' } : { flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: showWebShell
            ? [{ display: 'none' }]
            : { backgroundColor: colors.tabBar, borderTopColor: colors.tabBarBorder },
          headerStyle: { backgroundColor: colors.surface },
          headerTitleStyle: { color: colors.text, fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today'),
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: t('tabs.medications'),
          tabBarIcon: ({ color }) => <TabIcon name="pill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: t('tabs.history'),
          tabBarIcon: ({ color }) => <TabIcon name="clipboard-text-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t('tabs.stock'),
          tabBarIcon: ({ color }) => <TabIcon name="package-variant-closed" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profiles'),
          tabBarIcon: ({ color }) => <TabIcon name="account-group-outline" color={color} />,
        }}
      />
      </Tabs>
      </View>
    </View>
  );
}
