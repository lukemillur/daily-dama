import { createContext, type PropsWithChildren, useContext, useState } from 'react';

interface PendingVerificationEmailValue {
  readonly email: string | undefined;
  readonly setEmail: (email: string | undefined) => void;
}

const PendingVerificationEmailContext = createContext<PendingVerificationEmailValue | undefined>(
  undefined,
);

export function PendingVerificationEmailProvider({ children }: PropsWithChildren) {
  const [email, setEmail] = useState<string | undefined>(undefined);

  return (
    <PendingVerificationEmailContext.Provider value={{ email, setEmail }}>
      {children}
    </PendingVerificationEmailContext.Provider>
  );
}

export function usePendingVerificationEmail(): string | undefined {
  const value = useContext(PendingVerificationEmailContext);
  if (!value) {
    throw new Error("usePendingVerificationEmail must be used within PendingVerificationEmailProvider.");
  }
  return value.email;
}

export function useSetPendingVerificationEmail(): (email: string | undefined) => void {
  const value = useContext(PendingVerificationEmailContext);
  if (!value) {
    throw new Error("useSetPendingVerificationEmail must be used within PendingVerificationEmailProvider.");
  }
  return value.setEmail;
}
