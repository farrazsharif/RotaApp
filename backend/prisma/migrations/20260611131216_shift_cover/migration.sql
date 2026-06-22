-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "departmentId" TEXT,
    "serviceUserId" TEXT,
    "seriesId" TEXT,
    "date" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "visitName" TEXT,
    "cover" INTEGER NOT NULL DEFAULT 1,
    "role" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Shift_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Shift_serviceUserId_fkey" FOREIGN KEY ("serviceUserId") REFERENCES "ServiceUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Shift" ("createdAt", "date", "departmentId", "endTime", "id", "notes", "role", "seriesId", "serviceUserId", "startTime", "status", "updatedAt", "userId", "visitName") SELECT "createdAt", "date", "departmentId", "endTime", "id", "notes", "role", "seriesId", "serviceUserId", "startTime", "status", "updatedAt", "userId", "visitName" FROM "Shift";
DROP TABLE "Shift";
ALTER TABLE "new_Shift" RENAME TO "Shift";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
