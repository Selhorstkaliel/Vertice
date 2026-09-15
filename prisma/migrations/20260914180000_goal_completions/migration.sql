-- CreateTable
CREATE TABLE "GoalCompletion" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalCompletion_userId_idx" ON "GoalCompletion"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GoalCompletion_goalId_periodStart_key" ON "GoalCompletion"("goalId", "periodStart");

-- AddForeignKey
ALTER TABLE "GoalCompletion" ADD CONSTRAINT "GoalCompletion_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalCompletion" ADD CONSTRAINT "GoalCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

