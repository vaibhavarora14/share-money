import { verifyAuth } from '../_shared/auth.ts';
import { createErrorResponse, handleError } from '../_shared/error-handler.ts';
import { log } from '../_shared/logger.ts';
import { createEmptyResponse, createSuccessResponse } from '../_shared/response.ts';
import { isValidDate, isValidUUID, validateBodySize } from '../_shared/validation.ts';

/**
 * Import Splitwise Edge Function
 *
 * Bulk-imports a Splitwise group export (parsed client-side) into a
 * SharedMoney group in a single request:
 * - POST /import-splitwise - Create expenses (with exact per-participant
 *   splits, unlike the equal-split /transactions endpoint) and settlements.
 *
 * The client parses the Splitwise CSV, maps Splitwise members to group
 * participants and sends resolved participant IDs. If any insert fails,
 * previously inserted rows from the same request are rolled back so the
 * import is all-or-nothing.
 *
 * @route /functions/v1/import-splitwise
 * @requires Authentication
 */

interface ImportSplit {
  participant_id: string;
  amount: number;
}

interface ImportExpense {
  description: string;
  date: string; // YYYY-MM-DD
  category?: string | null;
  currency: string; // 3-letter code
  amount: number;
  paid_by_participant_id: string;
  splits: ImportSplit[];
}

interface ImportSettlement {
  from_participant_id: string;
  to_participant_id: string;
  amount: number;
  currency: string; // 3-letter code
  notes?: string | null;
}

interface ImportRequest {
  import_id?: string;
  group_id: string;
  expenses: ImportExpense[];
  settlements: ImportSettlement[];
}

interface StoredImport {
  id: string;
  group_id: string;
  status: 'processing' | 'completed' | 'failed';
  imported_expenses: number;
  imported_settlements: number;
  activated: boolean;
}

const MAX_IMPORT_ITEMS = 2000;
const MAX_AMOUNT = 1000000;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORY_LENGTH = 50; // transactions.category is VARCHAR(50)
const MAX_NOTES_LENGTH = 1000;
const SPLIT_SUM_TOLERANCE = 0.02;

async function markImportFailed(supabase: any, importId: string | undefined): Promise<void> {
  if (!importId) return;

  const { error } = await supabase
    .from('splitwise_imports')
    .update({ status: 'failed', updated_at: new Date().toISOString() })
    .eq('id', importId)
    .eq('status', 'processing');

  if (error) {
    log.warn('Failed to mark Splitwise import as failed', 'import-splitwise', {
      importId,
      error: error.message,
      code: error.code,
    });
  }
}

async function activateImportedGroup(supabase: any, groupId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('groups')
    .update({
      activated_at: new Date().toISOString(),
      activation_method: 'splitwise_import',
    })
    .eq('id', groupId)
    .is('activated_at', null)
    .select('id');

  if (error) {
    log.warn('Failed to mark group as activated after Splitwise import', 'import-splitwise', {
      groupId,
      error: error.message,
      code: error.code,
    });
    return false;
  }

  return (data || []).length > 0;
}

function isValidAmount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= MAX_AMOUNT
  );
}

function isValidCurrency(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value);
}

/** Returns an error message for the expense at `index`, or null if valid. */
function validateExpense(expense: ImportExpense, index: number): string | null {
  const label = `Expense ${index + 1}`;

  if (
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
  if (
    typeof expense.paid_by_participant_id !== 'string' ||
    !isValidUUID(expense.paid_by_participant_id)
  ) {
    return `${label}: paid_by_participant_id must be a valid UUID`;
  }
  if (!Array.isArray(expense.splits) || expense.splits.length === 0) {
    return `${label}: splits must be a non-empty array`;
  }

  const seenParticipants = new Set<string>();
  let splitSum = 0;
  for (const split of expense.splits) {
    if (!split || typeof split !== 'object') {
      return `${label}: each split must be an object`;
    }
    if (typeof split.participant_id !== 'string' || !isValidUUID(split.participant_id)) {
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

/** Returns an error message for the settlement at `index`, or null if valid. */
function validateSettlement(settlement: ImportSettlement, index: number): string | null {
  const label = `Settlement ${index + 1}`;

  if (
    typeof settlement.from_participant_id !== 'string' ||
    !isValidUUID(settlement.from_participant_id)
  ) {
    return `${label}: from_participant_id must be a valid UUID`;
  }
  if (
    typeof settlement.to_participant_id !== 'string' ||
    !isValidUUID(settlement.to_participant_id)
  ) {
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

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return createEmptyResponse(200, req);
  }

  let importId: string | undefined;
  let importReservationStarted = false;

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

    const { user, supabase } = authResult;

    if (!body) {
      return createErrorResponse(400, 'Request body is required', 'VALIDATION_ERROR', undefined, req);
    }

    let importData: ImportRequest;
    try {
      importData = JSON.parse(body);
    } catch {
      return createErrorResponse(400, 'Invalid JSON in request body', 'VALIDATION_ERROR', undefined, req);
    }

    if (!importData.group_id || !isValidUUID(importData.group_id)) {
      return createErrorResponse(400, 'Invalid group_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
    }

    if (importData.import_id !== undefined && !isValidUUID(importData.import_id)) {
      return createErrorResponse(400, 'Invalid import_id format. Expected UUID.', 'VALIDATION_ERROR', undefined, req);
    }
    importId = importData.import_id;

    const expenses = Array.isArray(importData.expenses) ? importData.expenses : [];
    const settlements = Array.isArray(importData.settlements) ? importData.settlements : [];

    if (expenses.length === 0 && settlements.length === 0) {
      return createErrorResponse(400, 'Nothing to import: provide at least one expense or settlement', 'VALIDATION_ERROR', undefined, req);
    }

    if (expenses.length + settlements.length > MAX_IMPORT_ITEMS) {
      return createErrorResponse(400, `Too many items to import (max ${MAX_IMPORT_ITEMS} per request)`, 'VALIDATION_ERROR', undefined, req);
    }

    for (let i = 0; i < expenses.length; i++) {
      const error = validateExpense(expenses[i], i);
      if (error) {
        return createErrorResponse(400, error, 'VALIDATION_ERROR', undefined, req);
      }
    }

    for (let i = 0; i < settlements.length; i++) {
      const error = validateSettlement(settlements[i], i);
      if (error) {
        return createErrorResponse(400, error, 'VALIDATION_ERROR', undefined, req);
      }
    }

    // Caller must be an active member of the group
    const { data: membership, error: membershipError } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', importData.group_id)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError || !membership) {
      return createErrorResponse(403, 'You must be an active member of the group to import expenses', 'PERMISSION_DENIED', undefined, req);
    }

    // All referenced participants must belong to the group
    const referencedParticipantIds = new Set<string>();
    expenses.forEach((expense) => {
      referencedParticipantIds.add(expense.paid_by_participant_id);
      expense.splits.forEach((split) => referencedParticipantIds.add(split.participant_id));
    });
    settlements.forEach((settlement) => {
      referencedParticipantIds.add(settlement.from_participant_id);
      referencedParticipantIds.add(settlement.to_participant_id);
    });

    const { data: participants, error: participantsError } = await supabase
      .from('participants')
      .select('id')
      .eq('group_id', importData.group_id)
      .in('id', Array.from(referencedParticipantIds));

    if (participantsError) {
      return handleError(participantsError, 'validating participants', req);
    }

    const foundParticipantIds = new Set((participants || []).map((p: { id: string }) => p.id));
    const invalidParticipantIds = Array.from(referencedParticipantIds).filter(
      (id) => !foundParticipantIds.has(id)
    );
    if (invalidParticipantIds.length > 0) {
      return createErrorResponse(400, `Invalid participant_ids: ${invalidParticipantIds.join(', ')}`, 'VALIDATION_ERROR', undefined, req);
    }

    if (importId) {
      const { data: existingImport, error: existingImportError } = await supabase
        .from('splitwise_imports')
        .select('id, group_id, status, imported_expenses, imported_settlements, activated')
        .eq('id', importId)
        .maybeSingle();

      if (existingImportError) {
        return handleError(existingImportError, 'checking Splitwise import idempotency', req);
      }

      if (existingImport) {
        const storedImport = existingImport as StoredImport;
        if (storedImport.group_id !== importData.group_id) {
          return createErrorResponse(409, 'That import id is already associated with another group', 'CONFLICT', undefined, req);
        }

        if (storedImport.status === 'completed') {
          return createSuccessResponse(
            {
              import_id: importId,
              imported_expenses: storedImport.imported_expenses,
              imported_settlements: storedImport.imported_settlements,
              activated: storedImport.activated,
              duplicate: true,
            },
            200,
            0,
            req,
          );
        }

        if (storedImport.status === 'processing') {
          return createErrorResponse(409, 'This import is already being processed. Please wait before trying again.', 'CONFLICT', undefined, req);
        }

        const { error: retryError } = await supabase
          .from('splitwise_imports')
          .update({ status: 'processing', updated_at: new Date().toISOString() })
          .eq('id', importId)
          .eq('status', 'failed');

        if (retryError) {
          return handleError(retryError, 'restarting Splitwise import', req);
        }
      } else {
        const { error: reserveError } = await supabase
          .from('splitwise_imports')
          .insert({ id: importId, group_id: importData.group_id, created_by: user.id });

        if (reserveError) {
          return handleError(reserveError, 'reserving Splitwise import', req);
        }
      }

      importReservationStarted = true;
    }

    // Insert transactions in bulk. Postgres INSERT ... RETURNING preserves the
    // order of the VALUES list, so returned ids line up with `expenses`.
    let insertedTransactionIds: number[] = [];

    if (expenses.length > 0) {
      const transactionRows = expenses.map((expense) => ({
        user_id: user.id,
        amount: expense.amount,
        description: expense.description.trim(),
        date: expense.date,
        type: 'expense',
        category: expense.category?.trim() || null,
        group_id: importData.group_id,
        currency: expense.currency.toUpperCase(),
        paid_by_participant_id: expense.paid_by_participant_id,
      }));

      const { data: insertedTransactions, error: transactionsInsertError } = await supabase
        .from('transactions')
        .insert(transactionRows)
        .select('id');

      if (transactionsInsertError || !insertedTransactions || insertedTransactions.length !== expenses.length) {
        await markImportFailed(supabase, importId);
        return handleError(
          transactionsInsertError || new Error('Transaction insert returned unexpected row count'),
          'importing transactions',
          req
        );
      }

      insertedTransactionIds = insertedTransactions.map((t: { id: number }) => t.id);

      const splitRows = expenses.flatMap((expense, index) =>
        expense.splits.map((split) => ({
          transaction_id: insertedTransactionIds[index],
          participant_id: split.participant_id,
          amount: split.amount,
        }))
      );

      const { error: splitsInsertError } = await supabase
        .from('transaction_splits')
        .insert(splitRows);

      if (splitsInsertError) {
        await rollbackTransactions(supabase, insertedTransactionIds);
        await markImportFailed(supabase, importId);
        log.error('Failed to insert splits during Splitwise import', 'import-splitwise', {
          groupId: importData.group_id,
          error: splitsInsertError.message,
          code: splitsInsertError.code,
        });
        return createErrorResponse(500, 'Failed to import expense splits', 'IMPORT_ERROR', undefined, req);
      }
    }

    if (settlements.length > 0) {
      const settlementRows = settlements.map((settlement) => ({
        group_id: importData.group_id,
        from_participant_id: settlement.from_participant_id,
        to_participant_id: settlement.to_participant_id,
        amount: settlement.amount,
        currency: settlement.currency.toUpperCase(),
        notes: settlement.notes?.trim() || null,
        created_by: user.id,
      }));

      const { error: settlementsInsertError } = await supabase
        .from('settlements')
        .insert(settlementRows);

      if (settlementsInsertError) {
        // Keep the import all-or-nothing: undo the transactions inserted above
        // (splits are removed via ON DELETE CASCADE).
        await rollbackTransactions(supabase, insertedTransactionIds);
        await markImportFailed(supabase, importId);
        log.error('Failed to insert settlements during Splitwise import', 'import-splitwise', {
          groupId: importData.group_id,
          error: settlementsInsertError.message,
          code: settlementsInsertError.code,
        });
        return createErrorResponse(500, 'Failed to import settlements', 'IMPORT_ERROR', undefined, req);
      }
    }

    const activated = await activateImportedGroup(supabase, importData.group_id);

    if (importId) {
      const { error: completeImportError } = await supabase
        .from('splitwise_imports')
        .update({
          status: 'completed',
          imported_expenses: expenses.length,
          imported_settlements: settlements.length,
          activated,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', importId)
        .eq('status', 'processing');

      if (completeImportError) {
        await markImportFailed(supabase, importId);
        return handleError(completeImportError, 'recording Splitwise import completion', req);
      }
    }

    log.info('Splitwise import completed', 'import-splitwise', {
      groupId: importData.group_id,
      importId,
      expenses: expenses.length,
      settlements: settlements.length,
    });

    return createSuccessResponse(
      {
        import_id: importId ?? null,
        imported_expenses: expenses.length,
        imported_settlements: settlements.length,
        activated,
        duplicate: false,
      },
      201,
      0,
      req
    );
  } catch (error: unknown) {
    if (importReservationStarted) {
      try {
        const authResult = await verifyAuth(req);
        await markImportFailed(authResult.supabase, importId);
      } catch {
        // Preserve the original error. A stale processing row is safer than
        // permitting an unverified retry that could duplicate ledger entries.
      }
    }
    return handleError(error, 'import-splitwise handler', req);
  }
});

// deno-lint-ignore no-explicit-any
async function rollbackTransactions(supabase: any, transactionIds: number[]): Promise<void> {
  if (transactionIds.length === 0) return;

  const { error } = await supabase
    .from('transactions')
    .delete()
    .in('id', transactionIds);

  if (error) {
    log.error('Failed to rollback transactions after import failure', 'import-splitwise', {
      transactionIds,
      error: error.message,
      code: error.code,
    });
  }
}
