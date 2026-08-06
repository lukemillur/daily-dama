export function getConfiguredAccessPassword(): string | undefined {
  const value = process.env.EXPO_PUBLIC_ACCESS_PASSWORD;
  return value && value.length > 0 ? value : undefined;
}

export function isCorrectAccessPassword(attempt: string, configuredPassword: string): boolean {
  return attempt === configuredPassword;
}
