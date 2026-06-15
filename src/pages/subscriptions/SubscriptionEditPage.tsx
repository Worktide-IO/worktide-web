import { useParams } from 'react-router';

import { SubscriptionForm } from './SubscriptionForm';

export function SubscriptionEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Abo-ID in der URL.</p>;
  }
  return <SubscriptionForm action="edit" id={id} />;
}
