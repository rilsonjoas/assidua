import { Link, usePathname } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../hooks/useTheme';

// Shell web W1 (2026-08-22) — o que faz o app "parecer site" não é a
// largura, é a NAVEGAÇÃO: navbar persistente no topo substitui a tab
// bar inferior em telas largas. Mesmos tokens visuais do tema (sem
// design novo), mesmos destinos e rótulos i18n da tab bar nativa.

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

export default function WebTopNav() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const pathname = usePathname() ?? '/';

  const items: { href: string; label: string; icon: IconName }[] = [
    { href: '/', label: t('tabs.today'), icon: 'home-outline' },
    { href: '/medications', label: t('tabs.medications'), icon: 'pill' },
    { href: '/history', label: t('tabs.history'), icon: 'clipboard-text-outline' },
    { href: '/stock', label: t('tabs.stock'), icon: 'package-variant-closed' },
    { href: '/profile', label: t('tabs.profiles'), icon: 'account-group-outline' },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' || pathname === '' : pathname.startsWith(href);

  return (
    <View style={[styles.nav, { backgroundColor: colors.tabBar, borderBottomColor: colors.tabBarBorder }]}>
      {/* Marca */}
      <View style={styles.brand}>
        <MaterialCommunityIcons name="pill" size={22} color={colors.brand} />
        <Text style={[styles.brandText, { color: colors.text }]}>Assídua</Text>
      </View>

      {/* Navegação */}
      <View style={styles.links}>
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} asChild>
              <TouchableOpacity
                // expo-router <Slot> exige estilo achatado (não-array)
                style={StyleSheet.flatten([
                  styles.link,
                  active && { borderBottomColor: colors.brand, borderBottomWidth: 2 },
                ])}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={20}
                  color={active ? colors.brand : colors.textMuted}
                />
                <Text
                  style={[
                    styles.linkText,
                    { color: active ? colors.brand : colors.textSecondary },
                    active && styles.linkTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            </Link>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 56,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandText: {
    fontSize: 17,
    fontWeight: '700',
  },
  links: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '500',
  },
  linkTextActive: {
    fontWeight: '700',
  },
});
