-- CreateTable
CREATE TABLE "ServiceUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATETIME NOT NULL,
    "nhsNumber" TEXT,
    "address" TEXT,
    "postcode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "needsMedication" BOOLEAN NOT NULL DEFAULT false,
    "needsMobility" BOOLEAN NOT NULL DEFAULT false,
    "needsPersonalCare" BOOLEAN NOT NULL DEFAULT false,
    "careNotes" TEXT,
    "visitDuration" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "_PreferredCaregivers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PreferredCaregivers_A_fkey" FOREIGN KEY ("A") REFERENCES "ServiceUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PreferredCaregivers_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_PreferredCaregivers_AB_unique" ON "_PreferredCaregivers"("A", "B");

-- CreateIndex
CREATE INDEX "_PreferredCaregivers_B_index" ON "_PreferredCaregivers"("B");
