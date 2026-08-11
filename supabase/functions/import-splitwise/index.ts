import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { isValidDate, isValidUUID, validateBodySize } from '../_shared/validation.ts';

interface ImportSplit {
  participant_id: string;
  amount: number;
}

interface ImportExpense {
  description: string;
  date: string;
  category?: string | null;
  currency: string;
  amount: number;
  paid_by_participant_id: string;
  splits: ImportSplit[];
}

interface ImportSettlement {
  from_participant_id: string;
  to_participant_id: string;
  amount: number;
  currency: string;
  notes?: string | null;
}

interface ImportRequest {
  import_id?: string;
  group_id: string;
  expenses: ImportExpense[];
  settlements: ImportSettlement[];
}

interface ImportResult {
  import_id: string;
  imported_expenses: number;
  imported_settlements: number;
  activated: boolean;
  duplicate: boolean;
}

const MAX_IMPORT_ITEMS = 2000;
const MAX_AMOUNT = 1000000;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORY_LENGTH = 50;
const MAX_NOTES_LENGTH = 1000;
const SPLIT_SUM_TOLERANCE = 0.02;

function isValidAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_AMOUNT;
}

function isValidCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value);
}

function validateExpense(expense: ImportExpense, index: number): string | null {
  const label = `Expense ${index + 1}`;

  if (
    !expense ||
    typeof expense !== 'object' ||
    typeof expense.description !== 'string' ||
    expense.description.trim().length === 0 ||
    expense.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return `${label}: description must be a non-empty string (max ${MAX_DESCRIPTION_LENGTH} characters)`;
  }
  if (typeof expense.date !== 'string' || !isValidDate(expense.date)) {
    return `${label}: invalid date format (expected YYYY-MM-DD)`;
  }
  if (
    expense.category !== undefined &&
    expense.category !== null &&
    (typeof expense.category !== 'string' || expense.category.length > MAX_CATEGORY_LENGTH)
  ) {
    return `${label}: category must be a string (max ${MAX_CATEGORY_LENGTH} characters)`;
  }
  if (!isValidCurrency(expense.currency)) {
    return `${label}: currency must be a 3-character code (e.g., USD)`;
  }
  if (!isValidAmount(expense.amount)) {
    return `${label}: amount must be a positive number up to ${MAX_AMOUNT}`;
  }
  if (!isValidUUID(expense.paid_by_participant_id)) {
    return `${label}: paid_by_participant_id must be a valid UUID`;
  }
  if (!Array.isArray(expense.splits) || expense.splits.length === 0) {
    return `${label}: splits must be a non-empty array`;
  }

  const seenParticipants = new Set<string>();
  let splitSum = 0;
  for (const split of expense.splits) {
    if (!split || typeof split !== 'object' || !isValidUUID(split.participant_id)) {
      return `${label}: split participant_id must be a valid UUID`;
    }
    if (seenParticipants.has(split.participant_id)) {
      return `${label}: duplicate participant in splits`;
    }
    seenParticipants.add(split.participant_id);
    if (!isValidAmount(split.amount)) {
      return `${label}: split amounts must be positive numbers up to ${MAX_AMOUNT}`;
    }
    splitSum += split.amount;
  }

  if (Math.abs(splitSum - expense.amount) > SPLIT_SUM_TOLERANCE) {
    return `${label}: split amounts (${splitSum.toFixed(2)}) do not add up to the expense amount (${expense.amount.toFixed(2)})`;
  }

  return null;
}

function validateSettlement(settlement: ImportSettlement, index: number): string | null {
  const label = `Settlement ${index + 1}`;

  if (!settlement || typeof settlement !== 'object' || !isValidUUID(settlement.from_participant_id)) {
    return `${label}: from_participant_id must be a valid UUID`;
  }
  if (!isValidUUID(settlement.to_participant_id)) {
    return `${label}: to_participant_id must be a valid UUID`;
  }
  if (settlement.from_participant_id === settlement.to_participant_id) {
    return `${label}: from and to participants must be different`;
  }
  if (!isValidAmount(settlement.amount)) {
    return `${label}: amount must be a positive number up to ${MAX_AMOUNT}`;
  }
  if (!isValidCurrency(settlement.currency)) {
    return `${label}: currency must be a 3-character code (e.g., USD)`;
  }
  if (
    settlement.notes !== undefined &&
    settlement.notes !== null &&
    (typeof settlement.notes !== 'string' || settlement.notes.length > MAX_NOTES_LENGTH)
  ) {
    return `${label}: notes must be a string (max ${MAX_NOTES_LENGTH} characters)`;
  }

  return null;
}

function rpcErrorResponse(error: { code?: string }, req: Request): Response | null {
  if (error.code === '23505') {
    return createErrorResponse(409, 'That import id is already in use', 'CONFLICT', undefined, req);
  }
  if (error.code === '55P03') {
    return createErrorResponse(409, 'This import is already being processed', 'CONFLICT', undefined, req);
  }
  if (error.code === '42501') {
    return createErrorResponse(403, 'You must be an active member of the group', 'PERMISSION_DENIED', undefined, req);
  }
  if (['22023', '22P02', '22003', '22007', '23502', '23503', '23514'].includes(error.code || '')) {
    return createErrorResponse(400, 'The confirmed import contains invalid data', 'VALIDATION_ERROR', undefined, req);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  try {
    if (req.method !== 'POST') {
      return createErrorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED', undefined, req);
    }

    const body = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(body);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(413, bodySizeValidation.error || 'Request body too large', 'VALIDATION_ERROR', undefined, req);
    }

    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, 'authentication', req);
    }

    if (!body) {
      return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR', undefined, req);
    }

    let importData: ImportRequest;
    try {
      importData = JSON.parse(body);
    } catch {
      return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR', undefined, req);
    }

    if (!isValidUUID(importData.group_id)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
    }
    if (importData.import_id !== undefined && !isValidUUID(importData.import_id)) {
      return createErrorResponse(400, 'Invalid import_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
    }

    const importId = importData.import_id ?? crypto.randomUUID();
    const expenses = Array.isArray(importData.expenses) ? importData.expenses : [];
    const settlements = Array.isArray(importData.settlements) ? importData.settlements : [];

    if (expenses.length === 0 && settlements.length === 0) {
      return createErrorResponse(400, 'Nothing to import: provide at least one expense or settlement', 'VALIDATION_ERROR', undefined, req);
    }
    if (expenses.length + settlements.length > MAX_IMPORT_ITEMS) {
      return createErrorResponse(400, `Too many items to import (max ${MAX_IMPORT_ITEMS} per request)`, 'VALIDATION_ERROR', undefined, req);
    }

    for (let index = 0; index < expenses.length; index += 1) {
      const validationError = validateExpense(expenses[index], index);
      if (validationError) {
        return createErrorResponse(400, validationError, 'VALIDATION_ERROR', undefined, req);
      }
    }
    for (let index = 0; index < settlements.length; index += 1) {
      const validationError = validateSettlement(settlements[index], index);
      if (validationError) {
        return createErrorResponse(400, validationError, 'VALIDATION_ERROR', undefined, req);
      }
    }

    const { data, error } = await authResult.supabase.rpc('import_splitwise', {
      p_import_id: importId,
      p_group_id: importData.group_id,
      p_expenses: expenses,
      p_settlements: settlements,
    });

    if (error) {
      return rpcErrorResponse(error, req) || handleError(error, 'importing Splitwise ledger', req);
    }

    const result = data as ImportResult;
    log.info('Splitwise import completed', 'import-splitwise', {
      groupId: importData.group_id,
      importId,
      expenses: result.imported_expenses,
      settlements: result.imported_settlements,
      duplicate: result.duplicate,
    });

    return createSuccessResponse(result, result.duplicate ? 200 : 201, 0, req);
  } catch (error: unknown) {
    return handleError(error, 'import-splitwise handler', req);
  }
});
