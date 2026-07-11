import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { ContactPortalAccess } from '@/components/ContactPortalAccess';
import { ContactPortalFeatures } from '@/components/ContactPortalFeatures';
import { ContactForm } from './ContactForm';
import { ContactAbsencesCard } from './ContactAbsencesCard';

export function ContactEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">{t('contact_edit.missing_id')}</p>;
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
