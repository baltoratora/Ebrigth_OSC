-- Annual Showcase tables only (enums already exist in DB)

CREATE TABLE "showcase_edition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "status" "ShowcaseEditionStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "venueName" TEXT,
    "venueAddress" TEXT,
    "participantTarget" INTEGER NOT NULL DEFAULT 0,
    "profitabilityTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "registrationDeadline" TIMESTAMP(3),
    "testRunDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'MYR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_edition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_member" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_category" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "maxTeamSize" INTEGER NOT NULL DEFAULT 4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_fee_wave" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_fee_wave_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_participant" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "feeWaveId" TEXT,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "teamName" TEXT,
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_participant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_task" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ShowcaseTaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "ShowcaseTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" INTEGER,
    "createdById" INTEGER,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_budget_item" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "type" "ShowcaseBudgetType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "ShowcaseBudgetItemStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_budget_item_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_sponsor" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "packageType" TEXT,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pipelineStatus" "ShowcaseSponsorStatus" NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "isVVIP" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_sponsor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_announcement" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetUnits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_announcement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "showcase_post_mortem" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "highlights" TEXT,
    "lowlights" TEXT,
    "suggestions" TEXT,
    "authorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "showcase_post_mortem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "showcase_member_editionId_userId_key" ON "showcase_member"("editionId", "userId");
CREATE INDEX "showcase_participant_editionId_idx" ON "showcase_participant"("editionId");
CREATE INDEX "showcase_task_editionId_unit_idx" ON "showcase_task"("editionId", "unit");
CREATE INDEX "showcase_budget_item_editionId_idx" ON "showcase_budget_item"("editionId");
CREATE INDEX "showcase_sponsor_editionId_idx" ON "showcase_sponsor"("editionId");
CREATE INDEX "showcase_announcement_editionId_idx" ON "showcase_announcement"("editionId");
CREATE INDEX "showcase_post_mortem_editionId_idx" ON "showcase_post_mortem"("editionId");

ALTER TABLE "showcase_member" ADD CONSTRAINT "showcase_member_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_member" ADD CONSTRAINT "showcase_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "showcase_category" ADD CONSTRAINT "showcase_category_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_fee_wave" ADD CONSTRAINT "showcase_fee_wave_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_participant" ADD CONSTRAINT "showcase_participant_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_participant" ADD CONSTRAINT "showcase_participant_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "showcase_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "showcase_participant" ADD CONSTRAINT "showcase_participant_feeWaveId_fkey" FOREIGN KEY ("feeWaveId") REFERENCES "showcase_fee_wave"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "showcase_task" ADD CONSTRAINT "showcase_task_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_task" ADD CONSTRAINT "showcase_task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "showcase_task" ADD CONSTRAINT "showcase_task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "showcase_budget_item" ADD CONSTRAINT "showcase_budget_item_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_budget_item" ADD CONSTRAINT "showcase_budget_item_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "showcase_sponsor" ADD CONSTRAINT "showcase_sponsor_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_announcement" ADD CONSTRAINT "showcase_announcement_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_announcement" ADD CONSTRAINT "showcase_announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "showcase_post_mortem" ADD CONSTRAINT "showcase_post_mortem_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "showcase_edition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "showcase_post_mortem" ADD CONSTRAINT "showcase_post_mortem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
