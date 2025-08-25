export function buildParamName(
  namespace: string | undefined,
  key: string
): string {
  return namespace ? `${namespace}.${key}` : key;
}
