import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { ThemeColors } from '../../constants/theme';
import { useOnboardingStore } from '../../store/onboardingStore';
import { requestNotificationPermission, registerPushToken } from '../../services/notifications';

// Onboarding guiado (Fase 1 do roadmap) — 3 telas na primeira abertura.
// Decisão: carrossel explicativo, não formulário embutido. Quem já usa
// as telas Hoje/Medicamentos tem os próprios "estado vazio" com CTA de
// criar perfil/medicamento (já existentes e testados) — não duplicar
// essa lógica aqui, só contextualizar o que o app faz antes do usuário
// chegar lá. O pedido de notificação, que antes disparava sem
// explicação no boot do app, agora só acontece aqui, no fim do
// onboarding, com contexto — boa prática (não pedir permissão "a frio").
const STEPS = [
  {
    icon: 'account-group-outline' as const,
    title: 'Cuide de quem você ama',
    text: 'Crie um perfil para cada pessoa — você mesmo, um filho, um paciente. Cada um com seus próprios medicamentos e horários.',
  },
  {
    icon: 'pill' as const,
    title: 'Nunca mais esqueça uma dose',
    text: 'Adicione os medicamentos e horários de cada perfil. O app monta a lista de doses do dia automaticamente.',
  },
  {
    icon: 'bell-ring-outline' as const,
    title: 'Lembretes na hora certa',
    text: 'Ative as notificações para receber um aviso no horário de cada dose. Você pode mudar isso depois, nas configurações do celular.',
  },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const setCompleted = useOnboardingStore((s) => s.setCompleted);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = async () => {
    await requestNotificationPermission();
    // Fase 1.5 — precisa vir DEPOIS da permissão (sem permissão, o token
    // não existe pra registrar mesmo). Best-effort, não bloqueia o fim
    // do onboarding se falhar.
    await registerPushToken();
    setCompleted();
    router.replace('/(tabs)/');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.skip} onPress={finish} accessibilityRole="button" accessibilityLabel="Pular introdução">
        <Text style={styles.skipText}>Pular</Text>
      </TouchableOpacity>

      <View style={styles.content} accessible accessibilityLabel={`Etapa ${step + 1} de ${STEPS.length}. ${current.title}. ${current.text}`}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name={current.icon} size={56} color={colors.brand} />
        </View>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.text}>{current.text}</Text>
      </View>

      <View style={styles.dots} importantForAccessibility="no-hide-descendants">
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <TouchableOpacity
        style={styles.nextBtn}
        onPress={() => (isLast ? finish() : setStep((s) => s + 1))}
        accessibilityRole="button"
        accessibilityLabel={isLast ? 'Ativar notificações e começar' : 'Próximo'}
      >
        <Text style={styles.nextBtnText}>{isLast ? 'Ativar notificações e começar' : 'Próximo'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background, paddingHorizontal: 24, paddingTop: 64, paddingBottom: 40 },
    skip: { alignSelf: 'flex-end' },
    skipText: { color: c.textMuted, fontSize: 14, fontWeight: '600' },
    content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
    iconCircle: {
      width: 112, height: 112, borderRadius: 56, backgroundColor: c.brandSubtle,
      alignItems: 'center', justifyContent: 'center', marginBottom: 8,
    },
    title: { fontSize: 22, fontWeight: '700', color: c.text, textAlign: 'center' },
    text: { fontSize: 15, color: c.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 8 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
    dotActive: { backgroundColor: c.brand, width: 20 },
    nextBtn: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
    nextBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
