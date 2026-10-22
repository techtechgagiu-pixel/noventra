'use client';
import { ErrorRecovery } from '@/components/error-recovery';
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return <html lang="ro"><body style={{ margin: 0, background: '#050914' }}><ErrorRecovery error={error} /></body></html>;
}
