import { useZkLogin } from '@mysten/enoki/react';

export function useSocialAccount(): { address: string } | null {
  const { address } = useZkLogin();
  return address ? { address } : null;
}
