import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface PasswordVisibilityContextValue {
  readonly isVisible: boolean;
  readonly toggle: () => void;
}

// `null` (rather than a default value) lets PasswordInput detect whether it was rendered inside a
// PasswordVisibilityProvider at all, so it can fall back to its own local per-instance state when
// a screen renders a single, unrelated password field (sign-in, account deletion) instead of a
// group of fields that should reveal/hide together.
const PasswordVisibilityContext = createContext<PasswordVisibilityContextValue | null>(null);

export interface PasswordVisibilityProviderProps {
  readonly children: ReactNode;
}

/**
 * Shares one show/hide state across every `PasswordInput` rendered underneath it, so toggling
 * visibility on any field in the group reveals or hides all of them together. Wrap the fields
 * that belong to a single logical form (e.g. new password + confirm password) with this
 * provider; unrelated password fields on the same screen should get their own provider, or none.
 */
export function PasswordVisibilityProvider({ children }: PasswordVisibilityProviderProps) {
  const [isVisible, setIsVisible] = useState(false);

  const value = useMemo<PasswordVisibilityContextValue>(
    () => ({ isVisible, toggle: () => setIsVisible((visible) => !visible) }),
    [isVisible],
  );

  return <PasswordVisibilityContext.Provider value={value}>{children}</PasswordVisibilityContext.Provider>;
}

export function usePasswordVisibilityContext(): PasswordVisibilityContextValue | null {
  return useContext(PasswordVisibilityContext);
}
