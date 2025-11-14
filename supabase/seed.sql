-- Seed Data for ShareMoney Database
-- This file contains test data to populate the database after migrations
-- Run automatically after migrations during `supabase db reset`
--
-- Test Users (password for all: testpassword123):
--   - alice@test.com (Alice)
--   - bob@test.com (Bob)
--   - charlie@test.com (Charlie)
--   - diana@test.com (Diana)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- ============================================================================
-- CREATE TEST USERS
-- ============================================================================

-- Note: We use fixed UUIDs for test users to make the seed deterministic
-- These UUIDs are generated once and reused for consistency

-- Test user UUIDs (v4 UUIDs generated for this seed)
DO $$
DECLARE
  alice_id UUID := '11111111-1111-1111-1111-111111111111';
  bob_id UUID := '22222222-2222-2222-2222-222222222222';
  charlie_id UUID := '33333333-3333-3333-3333-333333333333';
  diana_id UUID := '44444444-4444-4444-4444-444444444444';
  test_password TEXT := 'testpassword123';
BEGIN
  -- Create test users in auth.users
  -- Using crypt() for password hashing (requires pgcrypto extension)
  INSERT INTO auth.users (
    id,
    instance_id,
    aud,
    email,
    encrypted_password,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
    is_super_admin,
    role
  ) VALUES
    (
      alice_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'alice@test.com',
      crypt(test_password, gen_salt('bf')),
      NOW(),
      '',
      '',
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Alice"}',
      FALSE,
      'authenticated'
    ),
    (
      bob_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'bob@test.com',
      crypt(test_password, gen_salt('bf')),
      NOW(),
      '',
      '',
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Bob"}',
      FALSE,
      'authenticated'
    ),
    (
      charlie_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'charlie@test.com',
      crypt(test_password, gen_salt('bf')),
      NOW(),
      '',
      '',
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Charlie"}',
      FALSE,
      'authenticated'
    ),
    (
      diana_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'diana@test.com',
      crypt(test_password, gen_salt('bf')),
      NOW(),
      '',
      '',
      NOW(),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"name": "Diana"}',
      FALSE,
      'authenticated'
    )
  ON CONFLICT (id) DO UPDATE SET
    aud = EXCLUDED.aud,
    confirmation_token = EXCLUDED.confirmation_token,
    recovery_token = EXCLUDED.recovery_token;

  -- Create identities for the users (required for Supabase Auth)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES
    (
      gen_random_uuid(),
      alice_id,
      format('{"sub": "%s", "email": "alice@test.com"}', alice_id)::jsonb,
      'email',
      'alice@test.com',
      NOW(),
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      bob_id,
      format('{"sub": "%s", "email": "bob@test.com"}', bob_id)::jsonb,
      'email',
      'bob@test.com',
      NOW(),
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      charlie_id,
      format('{"sub": "%s", "email": "charlie@test.com"}', charlie_id)::jsonb,
      'email',
      'charlie@test.com',
      NOW(),
      NOW(),
      NOW()
    ),
    (
      gen_random_uuid(),
      diana_id,
      format('{"sub": "%s", "email": "diana@test.com"}', diana_id)::jsonb,
      'email',
      'diana@test.com',
      NOW(),
      NOW(),
      NOW()
    )
  ON CONFLICT DO NOTHING;

  -- ============================================================================
  -- CREATE TEST GROUPS
  -- ============================================================================

  -- Vacation group
  INSERT INTO groups (id, name, description, created_by, created_at, updated_at)
  VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Summer Vacation 2024',
    'Trip to Hawaii with friends',
    alice_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Dinner group
  INSERT INTO groups (id, name, description, created_by, created_at, updated_at)
  VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Weekly Dinner Club',
    'Regular dinner outings',
    bob_id,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- ============================================================================
  -- ADD GROUP MEMBERS
  -- ============================================================================

  -- Vacation group members: Alice (owner), Bob, Charlie, Diana
  INSERT INTO group_members (group_id, user_id, role, joined_at)
  VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', alice_id, 'owner', NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', bob_id, 'member', NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', charlie_id, 'member', NOW()),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', diana_id, 'member', NOW())
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- Dinner group members: Bob (owner), Alice, Charlie
  INSERT INTO group_members (group_id, user_id, role, joined_at)
  VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', bob_id, 'owner', NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', alice_id, 'member', NOW()),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', charlie_id, 'member', NOW())
  ON CONFLICT (group_id, user_id) DO NOTHING;

  -- ============================================================================
  -- CREATE TRANSACTIONS WITH SPLITS
  -- ============================================================================

  -- Hotel booking (Vacation group) - Alice paid, split 4 ways
  INSERT INTO transactions (id, amount, description, date, type, category, user_id, group_id, paid_by, split_among, currency, created_at)
  VALUES (
    1001,
    1200.00,
    'Hotel booking for 3 nights',
    '2024-07-15',
    'expense',
    'Accommodation',
    alice_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    alice_id,
    jsonb_build_array(alice_id::text, bob_id::text, charlie_id::text, diana_id::text),
    'USD',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Transaction splits for hotel
  INSERT INTO transaction_splits (transaction_id, user_id, amount)
  VALUES
    (1001, alice_id, 300.00),
    (1001, bob_id, 300.00),
    (1001, charlie_id, 300.00),
    (1001, diana_id, 300.00)
  ON CONFLICT (transaction_id, user_id) DO NOTHING;

  -- Restaurant dinner (Vacation group) - Bob paid, split 4 ways
  INSERT INTO transactions (id, amount, description, date, type, category, user_id, group_id, paid_by, split_among, currency, created_at)
  VALUES (
    1002,
    240.00,
    'Dinner at fancy restaurant',
    '2024-07-16',
    'expense',
    'Food',
    bob_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    bob_id,
    jsonb_build_array(alice_id::text, bob_id::text, charlie_id::text, diana_id::text),
    'USD',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Transaction splits for restaurant
  INSERT INTO transaction_splits (transaction_id, user_id, amount)
  VALUES
    (1002, alice_id, 60.00),
    (1002, bob_id, 60.00),
    (1002, charlie_id, 60.00),
    (1002, diana_id, 60.00)
  ON CONFLICT (transaction_id, user_id) DO NOTHING;

  -- Car rental (Vacation group) - Charlie paid, split 4 ways
  INSERT INTO transactions (id, amount, description, date, type, category, user_id, group_id, paid_by, split_among, currency, created_at)
  VALUES (
    1003,
    450.00,
    'Car rental for the week',
    '2024-07-14',
    'expense',
    'Transportation',
    charlie_id,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    charlie_id,
    jsonb_build_array(alice_id::text, bob_id::text, charlie_id::text, diana_id::text),
    'USD',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Transaction splits for car rental
  INSERT INTO transaction_splits (transaction_id, user_id, amount)
  VALUES
    (1003, alice_id, 112.50),
    (1003, bob_id, 112.50),
    (1003, charlie_id, 112.50),
    (1003, diana_id, 112.50)
  ON CONFLICT (transaction_id, user_id) DO NOTHING;

  -- Pizza night (Dinner group) - Bob paid, split 3 ways
  INSERT INTO transactions (id, amount, description, date, type, category, user_id, group_id, paid_by, split_among, currency, created_at)
  VALUES (
    2001,
    75.00,
    'Pizza night',
    '2024-08-01',
    'expense',
    'Food',
    bob_id,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    bob_id,
    jsonb_build_array(alice_id::text, bob_id::text, charlie_id::text),
    'USD',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Transaction splits for pizza
  INSERT INTO transaction_splits (transaction_id, user_id, amount)
  VALUES
    (2001, alice_id, 25.00),
    (2001, bob_id, 25.00),
    (2001, charlie_id, 25.00)
  ON CONFLICT (transaction_id, user_id) DO NOTHING;

  -- Sushi dinner (Dinner group) - Alice paid, split 3 ways
  INSERT INTO transactions (id, amount, description, date, type, category, user_id, group_id, paid_by, split_among, currency, created_at)
  VALUES (
    2002,
    180.00,
    'Sushi dinner',
    '2024-08-08',
    'expense',
    'Food',
    alice_id,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    alice_id,
    jsonb_build_array(alice_id::text, bob_id::text, charlie_id::text),
    'USD',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Transaction splits for sushi
  INSERT INTO transaction_splits (transaction_id, user_id, amount)
  VALUES
    (2002, alice_id, 60.00),
    (2002, bob_id, 60.00),
    (2002, charlie_id, 60.00)
  ON CONFLICT (transaction_id, user_id) DO NOTHING;

  -- ============================================================================
  -- CREATE SETTLEMENTS
  -- ============================================================================

  -- Bob settles up with Alice for vacation expenses
  INSERT INTO settlements (id, group_id, from_user_id, to_user_id, amount, currency, notes, created_by, created_at)
  VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    bob_id,
    alice_id,
    300.00,
    'USD',
    'Paid via Venmo',
    bob_id,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- Diana marks as received from Charlie
  INSERT INTO settlements (id, group_id, from_user_id, to_user_id, amount, currency, notes, created_by, created_at)
  VALUES (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    diana_id,
    charlie_id,
    112.50,
    'USD',
    'Received via PayPal',
    charlie_id,
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

END $$;
