import { useParams } from 'react-router';

import { ContactPortalAccess } from '@/components/ContactPortalAccess';
import { ContactForm } from './ContactForm';

export function ContactEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Kontakt-ID in der URL.</p>;
  }
  return (
    <div className="space-y-6">
      <ContactForm action="edit" id={id} />
      <ContactPortalAccess contactId={id} />
    </div>
  );
}
