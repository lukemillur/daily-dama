import { useRouter, type Href } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, Text } from 'react-native';

interface HeaderBackFallbackProps {
  readonly href: Href;
  readonly parentLabel: string;
  readonly tintColor: string;
}

/**
 * Back control for a nested screen that is the only entry in its stack (deep link, auth callback
 * replace), where the native header has no history to go back to.
 */
export function HeaderBackFallback({ href, parentLabel, tintColor }: HeaderBackFallbackProps) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${parentLabel}`}
      hitSlop={8}
      onPress={() => router.replace(href)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <SymbolView name="chevron.left" tintColor={tintColor} size={18} />
      <Text style={{ color: tintColor, fontSize: 16 }}>{parentLabel}</Text>
    </Pressable>
  );
}
