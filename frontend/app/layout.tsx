import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

// Since we have a `[locale]` segment, this root layout is required
// but won't render until we have a valid locale.
export default function RootLayout({ children }: Props) {
  return children;
}
