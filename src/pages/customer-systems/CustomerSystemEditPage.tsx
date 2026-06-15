import { useParams } from 'react-router';

import { CustomerSystemForm } from './CustomerSystemForm';

export function CustomerSystemEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine System-ID in der URL.</p>;
  }
  return <CustomerSystemForm action="edit" id={id} />;
}
