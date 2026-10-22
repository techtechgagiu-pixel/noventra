'use client';
import { ErrorRecovery } from '@/components/error-recovery';
export default function Error({ error }: { error: Error & { digest?: string } }) {
  return <ErrorRecovery error={error} />;
}
