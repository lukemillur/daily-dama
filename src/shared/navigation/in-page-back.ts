import { Platform } from 'react-native';

/**
 * Native nested screens get a stack header with a back control, so in-page "Back to <parent>"
 * links would duplicate it. Web has no header and keeps the links.
 */
export function shouldShowInPageBack(platformOS: string = Platform.OS): boolean {
  return platformOS === 'web';
}
