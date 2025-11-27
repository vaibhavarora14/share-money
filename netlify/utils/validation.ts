/**
 * Validates UUID format
 */
export function isValidUUID(uuid: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates date format (YYYY-MM-DD)
 */
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

/**
 * Validates transaction data
 */
export interface TransactionValidationResult {
  valid: boolean;
  error?: string;
}

export function validateTransactionData(data: {
  amount?: number;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  group_id?: string;
  currency?: string;
}): TransactionValidationResult {
  if (data.amount !== undefined) {
    if (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0) {
      return { valid: false, error: 'Amount must be a positive number' };
    }
    if (data.amount > 1000000) {
      return { valid: false, error: 'Amount exceeds maximum limit (1,000,000)' };
    }
  }

  if (data.description !== undefined) {
    if (typeof data.description !== 'string') {
      return { valid: false, error: 'Description must be a string' };
    }
    if (data.description.length === 0) {
      return { valid: false, error: 'Description cannot be empty' };
    }
    if (data.description.length > 1000) {
      return { valid: false, error: 'Description too long (max 1000 characters)' };
    }
  }

  if (data.date !== undefined) {
    if (!isValidDate(data.date)) {
      return { valid: false, error: 'Invalid date format (expected YYYY-MM-DD)' };
    }
  }

  if (data.type !== undefined) {
    if (data.type !== 'income' && data.type !== 'expense') {
      return { valid: false, error: 'Type must be either "income" or "expense"' };
    }
  }

  if (data.group_id !== undefined && data.group_id !== null) {
    if (!isValidUUID(data.group_id)) {
      return { valid: false, error: 'Invalid group_id format. Expected UUID.' };
    }
  }

  if (data.currency !== undefined && data.currency !== null) {
    if (typeof data.currency !== 'string' || data.currency.length !== 3) {
      return { valid: false, error: 'Currency must be a 3-character code (e.g., USD)' };
    }
  }

  return { valid: true };
}

/**
 * Validates group data
 */
export function validateGroupData(data: {
  name?: string;
  description?: string;
}): TransactionValidationResult {
  if (data.name !== undefined) {
    if (typeof data.name !== 'string') {
      return { valid: false, error: 'Name must be a string' };
    }
    const trimmed = data.name.trim();
    if (trimmed.length === 0) {
      return { valid: false, error: 'Name cannot be empty' };
    }
    if (trimmed.length > 255) {
      return { valid: false, error: 'Name too long (max 255 characters)' };
    }
  }

  if (data.description !== undefined && data.description !== null) {
    if (typeof data.description !== 'string') {
      return { valid: false, error: 'Description must be a string' };
    }
    if (data.description.length > 5000) {
      return { valid: false, error: 'Description too long (max 5000 characters)' };
    }
  }

  return { valid: true };
}

/**
 * Validates settlement data
 */
export function validateSettlementData(data: {
  group_id?: string;
  from_user_id?: string;
  to_user_id?: string;
  amount?: number;
  currency?: string;
}): TransactionValidationResult {
  if (data.group_id !== undefined && !isValidUUID(data.group_id)) {
    return { valid: false, error: 'Invalid group_id format. Expected UUID.' };
  }

  if (data.from_user_id !== undefined && !isValidUUID(data.from_user_id)) {
    return { valid: false, error: 'Invalid from_user_id format. Expected UUID.' };
  }

  if (data.to_user_id !== undefined && !isValidUUID(data.to_user_id)) {
    return { valid: false, error: 'Invalid to_user_id format. Expected UUID.' };
  }

  if (data.amount !== undefined) {
    if (typeof data.amount !== 'number' || isNaN(data.amount) || data.amount <= 0) {
      return { valid: false, error: 'Amount must be a positive number' };
    }
    if (data.amount > 1000000) {
      return { valid: false, error: 'Amount exceeds maximum limit (1,000,000)' };
    }
  }

  if (data.currency !== undefined && data.currency !== null) {
    if (typeof data.currency !== 'string' || data.currency.length !== 3) {
      return { valid: false, error: 'Currency must be a 3-character code (e.g., USD)' };
    }
  }

  return { valid: true };
}

/**
 * Validates request body size
 */
export function validateBodySize(body: string | null, maxSize: number = 1024 * 1024): TransactionValidationResult {
  if (!body) {
    return { valid: true };
  }
  
  if (body.length > maxSize) {
    return { valid: false, error: `Request body too large (max ${maxSize} bytes)` };
  }

  return { valid: true };
}

/**
 * Currency validation result
 */
export interface CurrencyValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

/**
 * Validates currency code format (ISO 4217: 3-letter uppercase code)
 * @param currency - Currency code to validate
 * @returns Validation result with normalized currency code if valid
 */
export function validateCurrency(currency: unknown): CurrencyValidationResult {
  if (!currency || typeof currency !== 'string' || currency.trim() === '') {
    return { valid: false, error: 'Currency is required' };
  }
  
  const normalized = currency.trim().toUpperCase();
  
  // Validate ISO 4217 format: exactly 3 uppercase letters
  if (!/^[A-Z]{3}$/.test(normalized)) {
    return { 
      valid: false, 
      error: 'Currency must be a valid 3-letter ISO code (e.g., USD, INR, EUR)' 
    };
  }
  
  return { valid: true, normalized };
}
