import { useParams } from 'react-router';

import { CustomerForm } from './CustomerForm';

export function CustomerEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Customer-ID in der URL.</p>;
  }
  return <CustomerForm action="edit" id={id} />;
}
