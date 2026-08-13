import { useNavigate, useParams } from 'react-router-dom';

import { findFeature } from '../../app/navigation';
import { BoardScreen, EmptyState } from '../../shared/ui';
import { LessonBoard } from '../lesson/LessonBoard';

export default function BoardPage() {
  const { feature } = useParams<{ feature: string }>();
  const navigate = useNavigate();
  const item = feature === undefined ? undefined : findFeature(feature);

  if (item === undefined || !item.hasBoardView) {
    return (
      <BoardScreen title="전자칠판" onExit={() => void navigate('/')}>
        <EmptyState
          title="표시할 화면이 없습니다"
          description="수업 진행과 형성평가 화면을 띄울 수 있습니다."
        />
      </BoardScreen>
    );
  }

  return (
    <BoardScreen title={item.label} onExit={() => void navigate(item.path)}>
      {item.id === 'lesson' ? (
        <LessonBoard />
      ) : (
        <p className="text-slate-500">이 화면은 기능을 이식할 때 실제 내용으로 채워집니다.</p>
      )}
    </BoardScreen>
  );
}
