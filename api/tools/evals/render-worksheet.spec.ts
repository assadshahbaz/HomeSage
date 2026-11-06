import { renderWorksheet } from './render-worksheet.ts';
import type { Worksheet } from './render-worksheet.ts';

const WORKSHEET: Worksheet = {
  milestone: 'M2',
  generatedAt: '2026-09-28T12:00:00.000Z',
  embeddingModel: 'embed-model',
  questions: [
    {
      question: {
        id: 'annexe-for-a-relative',
        category: 'granny flat',
        question: 'a house with a separate annexe where a relative could live',
        rule: 'SELECT p.id FROM properties p WHERE p.has_granny_flat = TRUE',
      },
      pathCounts: { sql: 1, bm25: 1, knn: 2 },
      candidates: [
        {
          id: 1201,
          foundBy: ['sql', 'knn'],
          record: {
            address: '1 Fernlea Grove | Aberdeen',
            kind: 'residential',
            bedrooms: 4,
            price: 325_000,
            facts: ['garden', 'a granny flat', 'oil heating'],
          },
          relevant: true,
        },
        {
          id: 1202,
          foundBy: ['bm25', 'knn'],
          record: {
            address: 'Flat 2, 3 Wrenfield Street, Aberdeen',
            kind: 'residential',
            bedrooms: null,
            price: 90_000,
            facts: [],
          },
          relevant: false,
        },
      ],
    },
  ],
};

describe('renderWorksheet', () => {
  const page = renderWorksheet(WORKSHEET);

  it('summarises each question: its pool, what each path found and how many are proposed relevant', () => {
    expect(page).toContain('| `annexe-for-a-relative` | 2 | 1 | 1 | 2 | 1 |');
  });

  it('shows the question, its category and the rule the labels were proposed by', () => {
    expect(page).toContain('## 1. annexe-for-a-relative');
    expect(page).toContain(
      '**Question:** a house with a separate annexe where a relative could live',
    );
    expect(page).toContain('**Category:** granny flat');
    expect(page).toContain(
      '**Rule:** `SELECT p.id FROM properties p WHERE p.has_granny_flat = TRUE`',
    );
  });

  it('lists each candidate with the paths that found it, its MySQL facts and the proposed label', () => {
    expect(page).toContain(
      '| 1201 | sql, knn | 1 Fernlea Grove \\| Aberdeen | residential | 4 | £325,000 | garden, a granny flat, oil heating | **relevant** |',
    );
    expect(page).toContain(
      '| 1202 | bm25, knn | Flat 2, 3 Wrenfield Street, Aberdeen | residential |  | £90,000 |  | no |',
    );
  });
});
