-- Seed Data for ShareMoney Database
-- This file contains initial data to populate the database after migrations
-- Run automatically after migrations during `supabase db reset`

-- Note: Transactions require a user_id, so we can't insert sample transactions
-- without an authenticated user. Sample data should be inserted via the application
-- or seed scripts after user authentication.

-- If you want to add sample data, you can do so here, but make sure to:
-- 1. Only insert data that doesn't require authentication context
-- 2. Or use a seed script (like scripts/seed-db.ts) that runs after users are created

-- Example (commented out - requires valid user_id):
-- INSERT INTO transactions (amount, description, date, type, category, user_id, currency) VALUES
--   (150.00, 'Grocery shopping at Whole Foods', '2024-01-15', 'expense', 'Food', 'USER_UUID_HERE', 'USD'),
--   (2500.00, 'Monthly salary', '2024-01-01', 'income', 'Salary', 'USER_UUID_HERE', 'USD'),
--   (45.50, 'Uber ride to airport', '2024-01-12', 'expense', 'Transportation', 'USER_UUID_HERE', 'USD'),
--   (89.99, 'Netflix subscription', '2024-01-10', 'expense', 'Entertainment', 'USER_UUID_HERE', 'USD'),
--   (500.00, 'Freelance project payment', '2024-01-08', 'income', 'Freelance', 'USER_UUID_HERE', 'USD')
-- ON CONFLICT DO NOTHING;

