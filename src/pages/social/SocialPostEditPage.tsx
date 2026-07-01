import { useParams } from 'react-router';

import { SocialPostComposer } from './SocialPostComposer';

export function SocialPostEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Post-ID in der URL.</p>;
  }
  return <SocialPostComposer action="edit" id={id} />;
}
