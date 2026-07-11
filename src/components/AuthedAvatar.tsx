import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

/**
 * Member avatar. The image is served by an auth-gated endpoint
 * (GET /v1/workspace_members/{id}/avatar), so it can't be a plain <img src> —
 * we blob-fetch it through the axios instance and show the object URL, falling
 * back to initials while loading, on 404 (no photo), or on error.
 */
export function AuthedAvatar({
  memberId,
  fallback,
  size,
  className,
}: {
  memberId?: string | null;
  fallback: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { data: url } = useQuery({
    queryKey: ['member-avatar', memberId],
    enabled: Boolean(memberId),
    staleTime: 5 * 60 * 1000,
    retry: false, // a 404 just means "no avatar" — don't hammer it
    queryFn: async () => {
      const res = await api.get(`/workspace_members/${memberId}/avatar`, { responseType: 'blob' });
      return URL.createObjectURL(res.data as Blob);
    },
  });

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <Avatar size={size} className={className}>
      {url ? <AvatarImage src={url} alt="" /> : null}
      <AvatarFallback>{fallback}</AvatarFallback>
    </Avatar>
  );
}
