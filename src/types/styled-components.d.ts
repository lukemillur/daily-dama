import 'styled-components/native';

declare module 'styled-components/native' {
  export interface DefaultTheme {
    readonly background: string;
    readonly accent: string;
    readonly text: string;
    readonly textMuted: string;
    readonly buttonBackground: string;
    readonly buttonBackgroundSecondary: string;
    readonly onButton: string;
    readonly onButtonSecondary: string;
    readonly onInk: string;
    readonly onAccent: string;
    readonly onAccentMuted: string;
  }
}
