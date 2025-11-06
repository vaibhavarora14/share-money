-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  amount DECIMAL(10, 2) NOT NULL,
  description TEXT NOT NULL,
  date DATE NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('income', 'expense')),
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert 5 dummy transactions
INSERT INTO transactions (amount, description, date, type, category) VALUES
  (150.00, 'Grocery shopping at Whole Foods', '2024-01-15', 'expense', 'Food'),
  (2500.00, 'Monthly salary', '2024-01-01', 'income', 'Salary'),
  (45.50, 'Uber ride to airport', '2024-01-12', 'expense', 'Transportation'),
  (89.99, 'Netflix subscription', '2024-01-10', 'expense', 'Entertainment'),
  (500.00, 'Freelance project payment', '2024-01-08', 'income', 'Freelance')
ON CONFLICT DO NOTHING;

