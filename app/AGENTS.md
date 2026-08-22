# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# EAS: update primeiro, build só por necessidade real (regra do Rilson, 2026-08-22)

O EAS tem limite de builds e o Rilson não quer pagar por eles à toa.
**Nenhum workflow dispara `eas build` automaticamente** — e é pra
continuar assim. Antes de qualquer build novo, OTA resolve?

## `eas update` cobre (caminho padrão, sempre tentar primeiro)

- Telas, componentes, estilos, lógica JS, assets empacotados no bundle
- Variáveis `EXPO_PUBLIC_*` (via `--environment` certo — ver abaixo)
- Correções e features comuns da semana

Comando padrão: `eas update --channel preview --environment preview -m "..."`
(sem o `--environment` o bundle sai SEM `EXPO_PUBLIC_API_URL` — bug do
localhost de 14/08).

## Build novo (APK/AAB) SÓ quando

1. Dependência **nativa** nova ou atualizada
2. Mudança em `android/`, `ios/`, ou no manifest do `app.json`
   (permissões, plugins, ícones, splash, versionCode, runtimeVersion)
3. Upgrade de Expo SDK / React Native

Na dúvida: perguntar pro Rilson antes de rodar `eas build`.
