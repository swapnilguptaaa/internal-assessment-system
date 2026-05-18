import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatStudentName(name: string | undefined | null): string {
  if (!name || name === '-' || name.startsWith('Student ')) return '-';
  // Check if name is exactly an enrollment number
  if (/^\d{4}[A-Za-z]{2}\d{6}$/.test(name)) return '-';
  return name;
}
