import { describe, expect, it, jest } from '@jest/globals';
import { Text, TouchableOpacity } from 'react-native';
import { act, create } from 'react-test-renderer';

import {
  PendingVerificationEmailProvider,
  usePendingVerificationEmail,
  useSetPendingVerificationEmail,
} from '@/features/auth/state/pending-verification-email';

function Reader() {
  const email = usePendingVerificationEmail();
  return <Text testID="reader">{email ?? 'none'}</Text>;
}

function Writer({ value }: { value: string }) {
  const setEmail = useSetPendingVerificationEmail();
  return (
    <TouchableOpacity testID="writer" onPress={() => setEmail(value)}>
      <Text>set</Text>
    </TouchableOpacity>
  );
}

describe('PendingVerificationEmailProvider', () => {
  it('starts undefined', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        <PendingVerificationEmailProvider>
          <Reader />
        </PendingVerificationEmailProvider>,
      );
    });

    const reader = root.root.findByProps({ testID: 'reader' });
    expect(reader.props.children).toBe('none');
  });

  it('propagates a set value to consumers', () => {
    let root!: ReturnType<typeof create>;
    act(() => {
      root = create(
        <PendingVerificationEmailProvider>
          <Reader />
          <Writer value="person@example.com" />
        </PendingVerificationEmailProvider>,
      );
    });

    act(() => {
      root.root.findByProps({ testID: 'writer' }).props.onPress();
    });

    const reader = root.root.findByProps({ testID: 'reader' });
    expect(reader.props.children).toBe('person@example.com');
  });

  it('throws when usePendingVerificationEmail is used outside the provider', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        create(<Reader />);
      });
    }).toThrow('usePendingVerificationEmail must be used within PendingVerificationEmailProvider.');
    errorSpy.mockRestore();
  });

  it('throws when useSetPendingVerificationEmail is used outside the provider', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      act(() => {
        create(<Writer value="a@b.com" />);
      });
    }).toThrow('useSetPendingVerificationEmail must be used within PendingVerificationEmailProvider.');
    errorSpy.mockRestore();
  });
});
