import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { CustomerSystemForm } from './CustomerSystemForm';

export function CustomerSystemEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">{t('customer_system_edit.missing_id')}</p>;
  }
  return <CustomerSystemForm action="edit" id={id} />;
}
