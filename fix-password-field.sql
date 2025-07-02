-- Fix database schema to allow null passwords
-- Run this SQL in your PostgreSQL database

ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;

-- Verify the change
\d users
