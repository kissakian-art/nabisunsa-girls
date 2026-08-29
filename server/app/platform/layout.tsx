import type { Metadata } from 'next';

/**
 * The console gets its own title.
 *
 * The topbar is a different colour from a school's for a reason — someone
 * administering several schools must never mistake this for one of them —
 * and that argument applies just as much to the browser tab. Two tabs both
 * reading "Marks Portal", one of which can suspend every school, is exactly
 * the confusion the colour was chosen to prevent.
 */
export const metadata: Metadata = {
  title: 'Midway platform',
  description: 'Schools, access and billing across the platform',
};

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
