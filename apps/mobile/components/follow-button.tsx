import { useState } from 'react';
import { Button } from '@/components/ui';

export function FollowButton({ handle }: { handle: string }) {
  const [following, setFollowing] = useState(false);
  return (
    <Button
      variant={following ? 'outline' : 'accent'}
      size="sm"
      onPress={() => setFollowing((v) => !v)}
    >
      {following ? 'Following' : 'Follow'}
    </Button>
  );
}
