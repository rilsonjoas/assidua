import { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { ptBR, enUS, es } from 'date-fns/locale';
import { useTheme } from '../hooks/useTheme';
import { maskMedicationName } from '../lib/privacy';
import { DoseLog, derivedState, scheduledInstantOf } from '../services/doses';

/**
 * E1 (2026-09-25) — "Você esqueceu de registrar?".
 *
 * O app **pergunta** o que a pessoa fez ontem, e não afirma. As três
 * razões, que são o motivo de ser deste componente:
 *
 * 1. **É pergunta, não veredito.** Registrar sozinho o que ela fez
 *    ontem é o app afirmando fato sobre o corpo dela — o mesmo mecanismo
 *    do "perdido" automático que o §9.3 acabou de tirar da tela. A
 *    revisão de interface ética classifica isso como erro, não como
 *    conveniência.
 * 2. **Ela provavelmente Taking e esqueceu de anotar.** A alternativa
 *    (só fechar o buraco) transformaria um esquecimento de digitação em
 *    "dose perdida" no registro médico. Pior que não perguntar nada.
 * 3. **O dado já existe.** Depois da P2 o Histórico devolve
 *    `unrecorded`; o app não precisa inventar nada, só perguntar.
 *
 * Por que "perguntar" e não "notificar": notificação que existe pra
 * gerar engajamento em vez de lembrar a dose é loss aversion espúria, e
 * é o que a skill de interface ética marca. Aqui o app pergunta **uma
 * vez**, no momento em que a pessoa abriu o app, e "Agora não" significa
 * "agora não" — não marca nada em nome dela.
 */

const DATE_FNS_LOCALES = { pt: ptBR, en: enUS, es } as const;

interface PendingDosesPromptProps {
  visible: boolean;
  /** Ocorrências de ontem (ou de antes, dentro da tolerância) sem registro. */
  doses: DoseLog[];
  isPrivate: boolean;
  /** Resolve cada dose. `'skipped'` é o que o botão "Pulei" grava. */
  onResolve: (dose: DoseLog, state: 'recorded' | 'skipped') => void;
  /** "Agora não": não marca nada. */
  onDismiss: () => void;
  onDone: () => void;
}

export function PendingDosesPrompt({
  visible,
  doses,
  isPrivate,
  onResolve,
  onDismiss,
  onDone,
}: PendingDosesPromptProps) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const [resolvidas, setResolvidas] = useState<Record<string, 'recorded' | 'skipped'>>({});
  const locale = DATE_FNS_LOCALES[i18n.language as keyof typeof DATE_FNS_LOCALES] ?? ptBR;

  function resolver(dose: DoseLog, state: 'recorded' | 'skipped') {
    setResolvidas((r) => ({ ...r, [String(dose.dose_schedule_id) + dose.scheduled_at]: state }));
    onResolve(dose, state);
  }

  function fechar() {
    setResolvidas({});
    onDone();
  }

  if (doses.length === 0) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={fechar}>
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('pendingDoses.title')}</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {t('pendingDoses.message', { count: doses.length })}
          </Text>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {doses.map((dose) => {
              const chave = String(dose.dose_schedule_id) + dose.scheduled_at;
              const feita = resolvidas[chave];
              const nome = maskMedicationName(dose.medication.name, isPrivate);

              return (
                <View
                  key={chave}
                  style={[styles.item, { borderColor: colors.border }]}
                  accessible
                  accessibilityLabel={t('pendingDoses.itemLabel', {
                    name: nome,
                    time: format(scheduledInstantOf(dose), 'HH:mm', { locale }),
                    state: t(feita === 'recorded' ? 'pendingDoses.took' : feita === 'skipped' ? 'pendingDoses.skipped' : 'pendingDoses.unanswered'),
                  })}
                >
                  <View style={styles.itemHead}>
                    <Text style={[styles.itemName, { color: colors.text }]}>{nome}</Text>
                    <Text style={[styles.itemTime, { color: colors.textMuted }]}>
                      {format(scheduledInstantOf(dose), 'HH:mm', { locale })}
                    </Text>
                  </View>

                  {feita ? (
                    <Text style={[styles.itemAnswer, { color: colors.success }]}>
                      {t(feita === 'recorded' ? 'pendingDoses.took' : 'pendingDoses.skipped')}
                    </Text>
                  ) : (
                    // **Uma** ação primária por linha ("Tomei") e uma
                    // secundária ("Pulei"), visualmente distintas. Duas
                    // com o mesmo peso fariam nenhuma.
                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        style={[styles.btnPrimary, { backgroundColor: colors.brand }]}
                        onPress={() => resolver(dose, 'recorded')}
                        accessibilityRole="button"
                        accessibilityLabel={t('pendingDoses.markTaken', { name: nome })}
                      >
                        <Text style={[styles.btnPrimaryText, { color: colors.onBrand }]}>
                          {t('pendingDoses.took')}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.btnSecondary, { borderColor: colors.border }]}
                        onPress={() => resolver(dose, 'skipped')}
                        accessibilityRole="button"
                        accessibilityLabel={t('pendingDoses.markSkipped', { name: nome })}
                      >
                        <Text style={[styles.btnSecondaryText, { color: colors.text }]}>
                          {t('pendingDoses.skipped')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            {/* "Agora não" é uma saída legítima e **não marca nada**. Não
                é descarte: a dose continua `unrecorded` e a pergunta volta
                na próxima abertura, porque a tolerância é de 24 h e ela
                ainda está dentro dela. */}
            <TouchableOpacity
              style={styles.dismissBtn}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('pendingDoses.notNow')}
            >
              <Text style={[styles.dismissText, { color: colors.textMuted }]}>
                {t('pendingDoses.notNow')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.doneBtn, { backgroundColor: colors.brand }]}
              onPress={fechar}
              accessibilityRole="button"
              accessibilityLabel={t('pendingDoses.done')}
            >
              <Text style={[styles.doneText, { color: colors.onBrand }]}>{t('pendingDoses.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** Só as ocorrências que a pessoa ainda não respondeu. */
export function unanswered(doses: DoseLog[]): DoseLog[] {
  return doses.filter((d) => derivedState(d) === 'unrecorded');
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 },
  content: { borderRadius: 20, padding: 20, maxHeight: '85%' },
  title: { fontSize: 19, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 14 },
  list: { flexGrow: 0 },
  listContent: { gap: 10 },
  item: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 15, fontWeight: '600', flex: 1 },
  itemTime: { fontSize: 14, marginLeft: 8 },
  itemAnswer: { fontSize: 14, fontWeight: '600' },
  itemActions: { flexDirection: 'row', gap: 8 },
  btnPrimary: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', minHeight: 44 },
  btnPrimaryText: { fontSize: 14, fontWeight: '700' },
  btnSecondary: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1, minHeight: 44 },
  btnSecondaryText: { fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dismissBtn: { paddingVertical: 12, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  dismissText: { fontSize: 14 },
  doneBtn: { paddingVertical: 12, paddingHorizontal: 22, borderRadius: 12, minHeight: 44, justifyContent: 'center' },
  doneText: { fontSize: 15, fontWeight: '700' },
});
