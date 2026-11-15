-- migrate:up
-- 002: one offer row per group per class.
--
-- `Offers` had only PRIMARY KEY (id). A group submits one offer, but two members
-- clicking submit in the same second inserted two pending rows, and the
-- professor's pending-offers list showed that group twice. Accepting one left
-- the other pending for the rest of the class, and `makeOffer` picks whichever
-- row the API returns first, so the group could see an offer the professor
-- never acted on. The client-side guard is fixed; this is the server side.
--
-- With the unique key in place, createOffer in offer.controller.ts becomes an
-- upsert, so a duplicate click lands on the row that is already there.
--
-- DESTRUCTIVE. The dedupe below deletes duplicate offer rows. For each
-- (class_id, group_id) it keeps the row the professor most likely acted on:
-- an `accepted` row first, then `pending`, then `rejected`, and within the
-- same status the highest id — the most recent submission. Take a backup first:
--
--   mysqldump -h <host> -u <user> -p <database> Offers > Offers-backup.sql
--
-- Safe to run twice: the dedupe is a no-op once there are no duplicates, and
-- the ALTER is skipped if the key already exists.

-- How many rows this is about to remove. Run on its own first if you want to
-- see the damage before committing to it. A row is doomed when some other row
-- for the same (class_id, group_id) outranks it on (status, then newest).
SELECT COUNT(DISTINCT o.`id`) AS duplicate_offers_to_delete
FROM `Offers` o
JOIN `Offers` keeper
  ON  keeper.`class_id` = o.`class_id`
  AND keeper.`group_id` = o.`group_id`
  AND (FIELD(keeper.`status`, 'accepted', 'pending', 'rejected'), -keeper.`id`)
    < (FIELD(o.`status`,      'accepted', 'pending', 'rejected'), -o.`id`);

DELETE o
FROM `Offers` o
JOIN `Offers` keeper
  ON  keeper.`class_id` = o.`class_id`
  AND keeper.`group_id` = o.`group_id`
  AND (FIELD(keeper.`status`, 'accepted', 'pending', 'rejected'), -keeper.`id`)
    < (FIELD(o.`status`,      'accepted', 'pending', 'rejected'), -o.`id`);

-- ADD UNIQUE KEY has no IF NOT EXISTS in MySQL, so check first.
SET @key_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'Offers'
    AND INDEX_NAME   = 'uniq_offer_per_group'
);

SET @stmt := IF(
  @key_exists = 0,
  'ALTER TABLE `Offers` ADD UNIQUE KEY `uniq_offer_per_group` (`class_id`, `group_id`)',
  'SELECT ''uniq_offer_per_group already present, nothing to do'' AS note'
);

PREPARE alter_stmt FROM @stmt;
EXECUTE alter_stmt;
DEALLOCATE PREPARE alter_stmt;

-- migrate:down
