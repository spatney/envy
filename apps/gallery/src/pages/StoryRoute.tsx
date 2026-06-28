import { useParams, Navigate } from 'react-router-dom';
import { StoryPage } from '../components/StoryPage';
import { storyById } from '../stories/registry';

export function StoryRoute() {
  const { id } = useParams<{ id: string }>();
  const story = id ? storyById(id) : undefined;
  if (!story) return <Navigate to="/" replace />;
  return (
    <div className="px-5 py-8 sm:px-8" key={story.id}>
      <StoryPage story={story} />
    </div>
  );
}
