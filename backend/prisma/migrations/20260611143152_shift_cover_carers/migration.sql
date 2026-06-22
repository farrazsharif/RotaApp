-- CreateTable
CREATE TABLE "_ShiftCoverCarers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_ShiftCoverCarers_A_fkey" FOREIGN KEY ("A") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_ShiftCoverCarers_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "_ShiftCoverCarers_AB_unique" ON "_ShiftCoverCarers"("A", "B");

-- CreateIndex
CREATE INDEX "_ShiftCoverCarers_B_index" ON "_ShiftCoverCarers"("B");
