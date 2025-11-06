#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL || 'https://xesuklogveedeppxbbit.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_ANON_KEY not found in environment variables');
  console.error('Make sure .env file exists in the root directory');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Since we can't execute raw SQL with anon key, we'll create the data programmatically
const transactions = [
  { amount: 150.00, description: 'Grocery shopping at Whole Foods', date: '2024-01-15', type: 'expense', category: 'Food' },
  { amount: 2500.00, description: 'Monthly salary', date: '2024-01-01', type: 'income', category: 'Salary' },
  { amount: 45.50, description: 'Uber ride to airport', date: '2024-01-12', type: 'expense', category: 'Transportation' },
  { amount: 89.99, description: 'Netflix subscription', date: '2024-01-10', type: 'expense', category: 'Entertainment' },
  { amount: 500.00, description: 'Freelance project payment', date: '2024-01-08', type: 'income', category: 'Freelance' },
];

async function seedDatabase() {
  console.log('🌱 Seeding database...\n');
  
  try {
    // Check if table exists by trying to query it
    const { data: existing, error: checkError } = await supabase
      .from('transactions')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.code === 'PGRST116') {
      console.log('❌ Table "transactions" does not exist!');
      console.log('\n📝 Please create the table first by running this SQL in Supabase dashboard:');
      console.log('─'.repeat(60));
      const sql = readFileSync('./netlify/supabase-seed.sql', 'utf-8');
      console.log(sql);
      console.log('─'.repeat(60));
      console.log('\nOr use the Supabase dashboard SQL Editor.');
      process.exit(1);
    }
    
    if (checkError) {
      console.error('❌ Error checking table:', checkError.message);
      process.exit(1);
    }
    
    console.log('✅ Table exists');
    
    // Check current count
    const { count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true });
    
    console.log(`📊 Current records: ${count || 0}\n`);
    
    if (count && count > 0) {
      console.log('⚠️  Table already has data. Skipping insert.');
      console.log('   To re-seed, delete existing records first.\n');
      return;
    }
    
    // Insert transactions
    console.log('📥 Inserting transactions...');
    const { data, error } = await supabase
      .from('transactions')
      .insert(transactions)
      .select();
    
    if (error) {
      console.error('❌ Error inserting data:', error.message);
      process.exit(1);
    }
    
    console.log(`✅ Successfully inserted ${data?.length || 0} transactions!\n`);
    console.log('📋 Inserted transactions:');
    data?.forEach((t, i) => {
      console.log(`   ${i + 1}. ${t.description} - $${t.amount} (${t.type})`);
    });
    
  } catch (error: any) {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  }
}

seedDatabase();

