export function maskMedicationName(name: string | null | undefined, isPrivate: boolean): string {
  if (!name) return '';
  if (isPrivate) return '••••••••';
  return name;
}
