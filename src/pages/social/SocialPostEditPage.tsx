import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { SocialPostComposer } from './SocialPostComposer';

export function SocialPostEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">{t('social_post_edit.missing_id')}</p>;
  }
  return <SocialPostComposer action="edit" id={id} />;
}
