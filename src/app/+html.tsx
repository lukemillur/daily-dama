import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/** Web-only document shell rendered before the application JavaScript loads. */
export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#f4c94d" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: 'html,body{background:#f4c94d}' }} />
      </head>
      <body>
        {/* Off-screen (not display:none) so Chrome's language detector has real English
            text to work with on first paint, before the app hydrates. Static routes render
            little to no visible text until then, which was causing false "Translate from
            Arabic?" prompts. */}
        <span
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          Daily Dama is a kendama trick practice tracker. Log your practice sessions, track
          which tricks you have landed, and follow your progress over time.
        </span>
        {children}
      </body>
    </html>
  );
}
