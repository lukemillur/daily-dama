import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { PasswordInput } from '@/features/auth/components/password-input';

describe('PasswordInput', () => {
  it('reveals and hides its value when the visibility toggle is pressed', async () => {
    const onChangeText = jest.fn();
    let root!: ReturnType<typeof create>;

    await act(async () => {
      root = create(<PasswordInput label="Password" value="secret-value" onChangeText={onChangeText} />);
    });

    const input = () => root.root.find((node) => node.props.accessibilityLabel === 'Password');
    expect(input().props.value).toBe('secret-value');
    expect(input().props.secureTextEntry).toBe(true);

    await act(async () => {
      root.root.find((node) => node.props.accessibilityLabel === 'Show Password').props.onPress();
    });

    expect(input().props.secureTextEntry).toBe(false);
    expect(root.root.find((node) => node.props.accessibilityLabel === 'Hide Password')).toBeTruthy();

    await act(async () => {
      root.root.find((node) => node.props.accessibilityLabel === 'Hide Password').props.onPress();
    });

    expect(input().props.secureTextEntry).toBe(true);
  });
});
