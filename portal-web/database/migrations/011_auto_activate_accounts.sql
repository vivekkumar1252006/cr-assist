-- Registration no longer requires college approval: new accounts are active
-- immediately. Accounts still marked "pending" by the old workflow are
-- activated so their owners can log in straight away.
ALTER TABLE users
  MODIFY COLUMN account_status ENUM('pending', 'active', 'suspended', 'rejected')
  NOT NULL DEFAULT 'active';

UPDATE users SET account_status = 'active' WHERE account_status = 'pending';
