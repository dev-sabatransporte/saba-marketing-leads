import { cookies } from 'next/headers';
import { SessionAppShell } from '@/features/auth/ui/layouts/SessionAppShell';

/** Cookie the shadcn sidebar writes when opened or collapsed. */
const SIDEBAR_COOKIE = 'sidebar_state';

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sidebarState = (await cookies()).get(SIDEBAR_COOKIE)?.value;
  return (
    <SessionAppShell defaultOpen={sidebarState !== 'false'}>
      {children}
    </SessionAppShell>
  );
}
