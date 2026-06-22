-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServiceUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATETIME NOT NULL,
    "siteId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServiceUser_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ServiceUser" ("active", "address", "careNotes", "createdAt", "dateOfBirth", "email", "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation", "firstName", "id", "lastName", "needsMedication", "needsMobility", "needsPersonalCare", "nhsNumber", "phone", "postcode", "updatedAt", "visitDuration") SELECT "active", "address", "careNotes", "createdAt", "dateOfBirth", "email", "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation", "firstName", "id", "lastName", "needsMedication", "needsMobility", "needsPersonalCare", "nhsNumber", "phone", "postcode", "updatedAt", "visitDuration" FROM "ServiceUser";
DROP TABLE "ServiceUser";
ALTER TABLE "new_ServiceUser" RENAME TO "ServiceUser";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Site_name_key" ON "Site"("name");
