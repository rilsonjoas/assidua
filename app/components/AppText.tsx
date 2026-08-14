import { Text as RNText, StyleSheet, TextProps } from 'react-native';
import { useFontScale } from '../hooks/useFontScale';

// Substituto do <Text> nativo que aplica o multiplicador de
// "Tamanho da fonte" (Perfil → Aparência) em cima do `fontSize` que a
// tela já define. Importado como `import { AppText as Text } from
// '.../AppText'` em todo o app — nenhum outro código muda, só o
// import, então o texto continua igual em todo lugar.
//
// Só escala quando `fontSize` está explícito no style (todo texto
// visível do app já define o próprio tamanho via StyleSheet — ver
// grep antes desta mudança). Sem isso, ficaria ambíguo multiplicar um
// tamanho que a gente nem sabe qual é.
//
// `allowFontScaling` do próprio RN continua ligado por cima disto — a
// fonte dinâmica do sistema operacional e este controle se somam, de
// propósito: quem também aumenta a fonte do aparelho tem os dois
// efeitos, não um cancelando o outro.
export function AppText({ style, ...rest }: TextProps) {
  const scale = useFontScale();
  const flat = StyleSheet.flatten(style) ?? {};
  const scaledStyle = typeof flat.fontSize === 'number'
    ? { ...flat, fontSize: flat.fontSize * scale }
    : flat;

  return <RNText style={scaledStyle} {...rest} />;
}
