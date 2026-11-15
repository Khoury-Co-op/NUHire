// src/models/DbBool.ts

// MySQL `tinyint(1)`. `mysql2` does not cast these to booleans, so a column
// declared BOOLEAN in the dump still arrives as 0 or 1. Comparing one with
// `=== true` is always false.
export type DbBool = 0 | 1;
