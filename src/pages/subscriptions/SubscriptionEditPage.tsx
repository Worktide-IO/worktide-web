import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { SubscriptionForm } from './SubscriptionForm';

export function SubscriptionEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">{t('subscription_edit.missing_id')}</p>;
  }
  return <SubscriptionForm action="edit" id={id} />;
}
