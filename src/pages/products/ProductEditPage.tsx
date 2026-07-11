import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { ProductForm } from './ProductForm';

export function ProductEditPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">{t('product_edit.missing_id')}</p>;
  }
  return <ProductForm action="edit" id={id} />;
}
