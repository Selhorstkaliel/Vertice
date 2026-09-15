-- Questions can carry several figures, placed inline with [[FIGURA n]] markers.
ALTER TABLE "Question" DROP COLUMN "figurePath",
ADD COLUMN     "figures" JSONB;

ALTER TABLE "QuestionDraft" DROP COLUMN "figureNote",
DROP COLUMN "figurePath",
ADD COLUMN     "figures" JSONB;

-- Resumable extraction.
ALTER TABLE "ExamPaper" ADD COLUMN     "answerKeyHash" TEXT,
ADD COLUMN     "layout" JSONB,
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ADD COLUMN     "aiRequests" INTEGER NOT NULL DEFAULT 0;
