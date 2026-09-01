import { listTrainings } from './trainingRepo';
import { listShots } from './shotRepo';
import { listCommentsByAthlete } from './commentRepo';
import type { ShotRecord, CommentRecord } from '../db/schema';

export interface AllShotsEntry {
  shot: ShotRecord;
  trainingId: string;
  globalNumber: number; // 1..N, chronological across trainings
  hasComment: boolean;
  commentText: string | null; // first comment text, for tooltip
}

export async function listAllShotsForAthlete(athleteId: string): Promise<AllShotsEntry[]> {
  const trainings = await listTrainings(athleteId);
  const chronological = [...trainings].sort((a, b) => {
    const byStartedAt = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
    if (byStartedAt !== 0) return byStartedAt;
    return a.id.localeCompare(b.id);
  });

  const committedShots: Array<{ shot: ShotRecord; trainingId: string }> = [];
  for (const training of chronological) {
    const shots = await listShots(training.id);
    for (const shot of shots) {
      if (shot.status === 'committed') committedShots.push({ shot, trainingId: training.id });
    }
  }

  const comments = await listCommentsByAthlete(athleteId);
  const firstCommentByShotId = new Map<string, CommentRecord>();
  for (const comment of comments) {
    if (!firstCommentByShotId.has(comment.shotId)) {
      firstCommentByShotId.set(comment.shotId, comment);
    }
  }

  return committedShots.map(({ shot, trainingId }, index) => {
    const comment = firstCommentByShotId.get(shot.id);
    return {
      shot,
      trainingId,
      globalNumber: index + 1,
      hasComment: comment !== undefined,
      commentText: comment ? comment.text : null,
    };
  });
}
