import { useParams } from 'react-router';

import { ContactForm } from './ContactForm';

export function ContactEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Kontakt-ID in der URL.</p>;
  }
  return <ContactForm action="edit" id={id} />;
}
