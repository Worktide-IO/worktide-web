import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { ServiceForm } from './ServiceForm';

export function ServiceEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">{t('service_edit.missing_id')}</p>;
  }
  return <ServiceForm action="edit" id={id} />;
}
