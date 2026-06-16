import { useParams } from 'react-router';

import { ProjectForm } from './ProjectForm';

export function ProjectEditPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <ProjectForm action="edit" id={id} />;
}
