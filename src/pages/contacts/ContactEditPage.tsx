import { useParams } from 'react-router';

import { ContactPortalAccess } from '@/components/ContactPortalAccess';
import { ContactPortalFeatures } from '@/components/ContactPortalFeatures';
import { ContactForm } from './ContactForm';
import { ContactAbsencesCard } from './ContactAbsencesCard';

export function ContactEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Kontakt-ID in der URL.</p>;
  }
  return (
    <div className="space-y-6">
      <ContactForm action="edit" id={id} />
      <ContactPortalAccess contactId={id} />
      <ContactPortalFeatures contactId={id} />
      <ContactAbsencesCard contactId={id} />
    </div>
  );
}
