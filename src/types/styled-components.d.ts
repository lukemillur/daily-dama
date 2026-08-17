import 'styled-components/native';

declare module 'styled-components/native' {
  export interface DefaultTheme {
    readonly background: string;
    readonly accent: string;
    readonly text: string;
  }
}
