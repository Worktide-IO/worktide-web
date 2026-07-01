import { useParams } from 'react-router';

import { ProductForm } from './ProductForm';

export function ProductEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) {
    return <p className="text-sm text-destructive">Keine Produkt-ID in der URL.</p>;
  }
  return <ProductForm action="edit" id={id} />;
}
