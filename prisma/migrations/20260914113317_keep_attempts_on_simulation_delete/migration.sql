-- DropForeignKey
ALTER TABLE "QuestionAttempt" DROP CONSTRAINT "QuestionAttempt_simulationAttemptId_fkey";

-- AddForeignKey
ALTER TABLE "QuestionAttempt" ADD CONSTRAINT "QuestionAttempt_simulationAttemptId_fkey" FOREIGN KEY ("simulationAttemptId") REFERENCES "SimulationAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

