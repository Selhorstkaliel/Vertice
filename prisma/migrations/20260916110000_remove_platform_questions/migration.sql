-- The shared bank now holds only questions from official past exams (and AI
-- questions written in their style, labeled as such). The authored practice
-- questions seeded before are removed; their attempts and simulation slots go
-- with them (cascade), error notebook entries keep their text-less record.
DELETE FROM "Question" WHERE "source" = 'PLATFORM' AND "ownerId" IS NULL;
