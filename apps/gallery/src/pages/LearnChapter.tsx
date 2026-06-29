import { Navigate, useParams } from 'react-router-dom';
import { Page } from '../components/ui/Page';
import { ChapterView } from '../components/learn/ChapterView';
import { chapterById } from '../learn/registry';

export function LearnChapter() {
  const { chapter: id } = useParams();
  const chapter = id ? chapterById.get(id) : undefined;
  if (!chapter) return <Navigate to="/learn" replace />;
  return (
    <Page wide>
      <ChapterView chapter={chapter} />
    </Page>
  );
}
