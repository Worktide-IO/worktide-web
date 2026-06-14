import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn convention — combine clsx + tailwind-merge for conditional className composition. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
