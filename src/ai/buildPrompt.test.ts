import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './buildPrompt';
import type { TrainingRecord, ShotRecord, CommentRecord } from '../db/schema';

function makeTraining(overrides: Partial<TrainingRecord> = {}): TrainingRecord {
  return {
    id: 't1',
    athleteId: 'a1',
    startedAt: '2025-07-10T10:00:00.000Z',
    updatedAt: '2025-07-10T10:00:00.000Z',
    completedAt: null,
    nextShotNumber: 3,
    targetShotCount: 10,
    ...overrides,
  };
}

function makeShot(overrides: Partial<ShotRecord> = {}): ShotRecord {
  return {
    id: crypto.randomUUID(),
    trainingId: 't1',
    shotNumber: 1,
    x: 120,
    y: -50,
    score: 104,
    status: 'committed',
    createdAt: '2025-07-10T10:00:00.000Z',
    updatedAt: '2025-07-10T10:00:00.000Z',
    ...overrides,
  };
}

function makeComment(overrides: Partial<CommentRecord> = {}): CommentRecord {
  return {
    id: crypto.randomUUID(),
    athleteId: 'a1',
    trainingId: 't1',
    shotId: '',
    text: 'дёрнул спуск',
    createdAt: '2025-07-10T10:00:00.000Z',
    updatedAt: '2025-07-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('buildSystemPrompt', () => {
  it('mentions ISSF 10m air pistol coaching role', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('ISSF 10 м пневматический пистолет');
  });

  it('documents targetShotCount semantics and the miss-vs-missing-data distinction', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('targetShotCount');
    expect(prompt).toContain('ПРОМАХ');
  });

  it('contains "вы" addressing the athlete', () => {
    const prompt = buildSystemPrompt();
    // The standalone pronoun 'вы' (polite address) must be present
    expect(prompt.toLowerCase()).toMatch(/вы/);
  });

  it('does not address athlete as "тебе" or "твой" in coaching instructions', () => {
    const prompt = buildSystemPrompt();
    // No direct addresses to the athlete as ты-form recipient of the report
    expect(prompt).not.toMatch(/тебе/i);
    expect(prompt).not.toContain('твой фокус');
    expect(prompt).not.toContain('Фокус стрелка');
  });

  it('section 4 describes arithmetic as an internal step, not output', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('внутренний шаг');
  });

  it('section 4 contains explicit ban on x/y, mm/cm, averages, medians, sums, percents, stddev', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('координаты x/y');
    expect(prompt).toContain('мм/см');
    expect(prompt).toContain('СКО');
    expect(prompt).toContain('разбросы');
  });

  it('section 5 does not list all metrics as mandatory output', () => {
    const prompt = buildSystemPrompt();
    // Old mandatory metric list should be gone
    expect(prompt).not.toContain('Оцени: количество выстрелов, общий результат');
    // Should focus on practical action
    expect(prompt.toLowerCase()).toContain('практическое значение');
  });

  it('number whitelist rule is present in formatting rules', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('белого списка');
    // Check ban on specific items
    expect(prompt).toContain('медианы');
    expect(prompt).toContain('суммы');
  });

  it('does not have "Итог тренировки" header', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).not.toContain('Итог тренировки');
  });

  it('has "Следующая тренировка" section header', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('## Следующая тренировка');
  });

  it('has "Ваш фокус" section header instead of "Фокус стрелка"', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('## Ваш фокус');
    expect(prompt).not.toContain('## Фокус стрелка');
  });

  it('still uses ISSF decimal for individual shot scores', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('ISSF decimal');
    expect(prompt).toContain('10.9');
  });
});

describe('buildUserPrompt', () => {
  it('produces valid JSON', () => {
    const prompt = buildUserPrompt([{ training: makeTraining(), shots: [makeShot()], comments: [], trainingComments: [] }]);
    expect(() => JSON.parse(prompt)).not.toThrow();
  });

  it('includes the raw internal score scale as a number', () => {
    const shot = makeShot({ score: 104 });
    const prompt = buildUserPrompt([{ training: makeTraining(), shots: [shot], comments: [], trainingComments: [] }]);
    const data = JSON.parse(prompt);
    expect(data[0].shots[0].score).toBe(104);
    expect(typeof data[0].shots[0].score).toBe('number');
  });

  it('includes x/y coordinates as numbers', () => {
    const shot = makeShot({ x: 120, y: -50 });
    const prompt = buildUserPrompt([{ training: makeTraining(), shots: [shot], comments: [], trainingComments: [] }]);
    const data = JSON.parse(prompt);
    expect(data[0].shots[0].x).toBe(120);
    expect(data[0].shots[0].y).toBe(-50);
  });

  it('includes targetShotCount', () => {
    const prompt = buildUserPrompt([
      { training: makeTraining({ targetShotCount: 60 }), shots: [makeShot()], comments: [], trainingComments: [] },
    ]);
    const data = JSON.parse(prompt);
    expect(data[0].targetShotCount).toBe(60);
  });

  it('includes trainingComments when present, omits when empty', () => {
    const withComments = buildUserPrompt([
      { training: makeTraining(), shots: [makeShot()], comments: [], trainingComments: ['целился в ветер'] },
    ]);
    expect(JSON.parse(withComments)[0].trainingComments).toEqual(['целился в ветер']);

    const withoutComments = buildUserPrompt([
      { training: makeTraining(), shots: [makeShot()], comments: [], trainingComments: [] },
    ]);
    expect(JSON.parse(withoutComments)[0].trainingComments).toBeUndefined();
  });

  it('attaches comments to their matching shot by shotId', () => {
    const shot = makeShot({ id: 's1' });
    const other = makeShot({ id: 's2', shotNumber: 2 });
    const comment = makeComment({ shotId: 's1', text: 'дёрнул спуск' });
    const prompt = buildUserPrompt([
      { training: makeTraining(), shots: [shot, other], comments: [comment], trainingComments: [] },
    ]);
    const data = JSON.parse(prompt);
    expect(data[0].shots[0].comments).toEqual(['дёрнул спуск']);
    expect(data[0].shots[1].comments).toBeUndefined();
  });

  it('omits the comments field when a shot has no comments', () => {
    const prompt = buildUserPrompt([{ training: makeTraining(), shots: [makeShot()], comments: [], trainingComments: [] }]);
    const data = JSON.parse(prompt);
    expect(data[0].shots[0].comments).toBeUndefined();
  });

  it('includes each training with its own trainingId and date', () => {
    const t1 = makeTraining({ id: 't1', startedAt: '2025-07-10T10:00:00.000Z' });
    const t2 = makeTraining({ id: 't2', startedAt: '2025-07-08T10:00:00.000Z' });
    const prompt = buildUserPrompt([
      { training: t1, shots: [makeShot({ trainingId: 't1' })], comments: [], trainingComments: [] },
      { training: t2, shots: [makeShot({ trainingId: 't2' })], comments: [], trainingComments: [] },
    ]);
    const data = JSON.parse(prompt);
    expect(data).toHaveLength(2);
    expect(data[0].date).toBe('2025-07-10');
    expect(data[1].date).toBe('2025-07-08');
  });

  it('excludes draft shots', () => {
    const shots = [
      makeShot({ shotNumber: 1, score: 104, status: 'committed' }),
      makeShot({ shotNumber: 2, score: 999, status: 'draft' }),
    ];
    const prompt = buildUserPrompt([{ training: makeTraining(), shots, comments: [], trainingComments: [] }]);
    const data = JSON.parse(prompt);
    expect(data[0].shotCount).toBe(1);
    expect(data[0].shots).toHaveLength(1);
    expect(data[0].shots[0].shotNumber).toBe(1);
  });

  it('handles a training with no committed shots', () => {
    const prompt = buildUserPrompt([{ training: makeTraining(), shots: [], comments: [], trainingComments: [] }]);
    const data = JSON.parse(prompt);
    expect(data[0].shotCount).toBe(0);
    expect(data[0].shots).toEqual([]);
  });
});
