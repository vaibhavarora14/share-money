import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyAuth } from "../_shared/auth.ts";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL } from "../_shared/env.ts";
import { createErrorResponse, handleError } from "../_shared/error-handler.ts";
import { log } from "../_shared/logger.ts";
import {
  buildRatesPayload,
  EXCHANGE_RATE_API_URL,
  FRANKFURTER_URL,
  isCacheFresh,
  mergeUsdRates,
  parseExchangeRateApiResponse,
  parseFrankfurterResponse,
  rowsToUsdRates,
  type GroupRateRow,
  usdRatesToRows,
  validateGroupRateInput,
} from "../_shared/rates.ts";
import { createEmptyResponse, createSuccessResponse } from "../_shared/response.ts";
import { isValidUUID, validateBodySize } from "../_shared/validation.ts";
import { requireMinVersion } from "../_shared/version-check.ts";

const FETCH_TIMEOUT_MS = 8000;

function createServiceClient() {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Upstream rates request failed (${response.status})`);
  }
  return response.json();
}

async function fetchFreshMarketRates(): Promise<{
  usdRates: Record<string, number>;
  asOf: string;
  providers: string[];
  providerFor: (code: string) => string;
} | null> {
  const [frankfurterResult, fallbackResult] = await Promise.allSettled([
    fetchJson(FRANKFURTER_URL),
    fetchJson(EXCHANGE_RATE_API_URL),
  ]);

  const frankfurter = frankfurterResult.status === "fulfilled"
    ? parseFrankfurterResponse(frankfurterResult.value)
    : null;
  const fallback = fallbackResult.status === "fulfilled"
    ? parseExchangeRateApiResponse(fallbackResult.value)
    : null;

  if (frankfurterResult.status === "rejected") {
    log.warn("Frankfurter market fetch failed", "rates", {
      error: frankfurterResult.reason instanceof Error
        ? frankfurterResult.reason.message
        : String(frankfurterResult.reason),
    });
  }
  if (fallbackResult.status === "rejected") {
    log.warn("Fallback market fetch failed", "rates", {
      error: fallbackResult.reason instanceof Error
        ? fallbackResult.reason.message
        : String(fallbackResult.reason),
    });
  }

  if (!frankfurter && !fallback) return null;

  const frankfurterCodes = new Set(Object.keys(frankfurter?.usdRates || {}));
  const providers = [
    ...(frankfurter ? ["frankfurter"] : []),
    ...(fallback ? ["exchangerate-api"] : []),
  ];

  return {
    usdRates: mergeUsdRates(frankfurter?.usdRates || {}, fallback?.usdRates || {}),
    asOf: frankfurter?.asOf || fallback?.asOf || new Date().toISOString().slice(0, 10),
    providers,
    providerFor: (code) =>
      frankfurterCodes.has(code) ? "frankfurter" : "exchangerate-api",
  };
}

async function loadMarketBook(serviceClient: ReturnType<typeof createServiceClient>) {
  const reader = serviceClient;
  let cached: Array<{
    quote_currency: string;
    rate: number | string;
    as_of: string;
    provider: string;
    updated_at: string;
  }> = [];

  if (reader) {
    const { data, error } = await reader
      .from("exchange_rates")
      .select("quote_currency, rate, as_of, provider, updated_at");
    if (error) {
      log.warn("Failed to read cached exchange rates", "rates", { error: error.message });
    } else {
      cached = data || [];
    }
  }

  const newest = cached.reduce<string | null>((latest, row) => {
    if (!row.updated_at) return latest;
    if (!latest || row.updated_at > latest) return row.updated_at;
    return latest;
  }, null);

  if (cached.length > 0 && isCacheFresh(newest)) {
    const providers = Array.from(new Set(cached.map((row) => row.provider).filter(Boolean)));
    const asOf = cached.reduce<string | null>((latest, row) => {
      if (!latest || row.as_of > latest) return row.as_of;
      return latest;
    }, null);
    return {
      usdRates: rowsToUsdRates(cached),
      asOf,
      stale: false,
      providers,
    };
  }

  const fresh = await fetchFreshMarketRates();
  if (fresh) {
    if (reader) {
      const rows = usdRatesToRows(fresh.usdRates, fresh.asOf, fresh.providerFor);
      const { error } = await reader.from("exchange_rates").upsert(rows, {
        onConflict: "base_currency,quote_currency",
      });
      if (error) {
        log.warn("Failed to cache exchange rates", "rates", { error: error.message });
      }
    }
    return {
      usdRates: fresh.usdRates,
      asOf: fresh.asOf,
      stale: false,
      providers: fresh.providers,
    };
  }

  if (cached.length > 0) {
    const providers = Array.from(new Set(cached.map((row) => row.provider).filter(Boolean)));
    const asOf = cached.reduce<string | null>((latest, row) => {
      if (!latest || row.as_of > latest) return row.as_of;
      return latest;
    }, null);
    return {
      usdRates: rowsToUsdRates(cached),
      asOf,
      stale: true,
      providers,
    };
  }

  return {
    usdRates: { USD: 1 },
    asOf: null,
    stale: true,
    providers: [] as string[],
  };
}

async function requireActiveMember(
  supabase: { from: (table: string) => any },
  groupId: string,
  userId: string,
  req: Request,
): Promise<Response | null> {
  const { data, error } = await supabase
    .from("group_members")
    .select("status")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return handleError(error, "checking group membership", req);
  }
  if (!data) {
    return createErrorResponse(404, "Group not found", "NOT_FOUND", undefined, req);
  }
  if (data.status !== "active") {
    return createErrorResponse(403, "Not an active group member", "PERMISSION_DENIED", undefined, req);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return createEmptyResponse(200, req);
  }

  const versionError = requireMinVersion(req);
  if (versionError) {
    return versionError;
  }

  try {
    const bodyText = await req.text().catch(() => null);
    const bodySizeValidation = validateBodySize(bodyText);
    if (!bodySizeValidation.valid) {
      return createErrorResponse(
        413,
        bodySizeValidation.error || "Request body too large",
        "VALIDATION_ERROR",
        undefined,
        req,
      );
    }

    let authResult;
    try {
      authResult = await verifyAuth(req);
    } catch (authError) {
      return handleError(authError, "authentication", req);
    }

    const { user, supabase } = authResult;
    const url = new URL(req.url);
    const groupId = url.searchParams.get("group_id");
    const serviceClient = createServiceClient();

    if (req.method === "GET") {
      if (groupId && !isValidUUID(groupId)) {
        return createErrorResponse(400, "Invalid group_id format. Expected UUID.", "VALIDATION_ERROR", undefined, req);
      }

      if (groupId) {
        const membershipError = await requireActiveMember(supabase, groupId, user.id, req);
        if (membershipError) return membershipError;
      }

      const market = await loadMarketBook(serviceClient);
      let overrides: GroupRateRow[] = [];

      if (groupId) {
        const { data, error } = await supabase
          .from("group_exchange_rates")
          .select("from_currency, to_currency, rate, source, updated_at")
          .eq("group_id", groupId);
        if (error) {
          return handleError(error, "fetching group exchange rates", req);
        }
        overrides = (data || []) as GroupRateRow[];
      }

      return createSuccessResponse(
        buildRatesPayload(market.usdRates, overrides, market.asOf, market.stale, market.providers),
        200,
        0,
        req,
      );
    }

    if (req.method === "PUT") {
      let parsedBody: unknown = {};
      try {
        parsedBody = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        return createErrorResponse(400, "Invalid JSON in request body", "VALIDATION_ERROR", undefined, req);
      }

      const validation = validateGroupRateInput(parsedBody);
      if (!validation.valid || !validation.value) {
        return createErrorResponse(400, validation.error || "Invalid rate data", "VALIDATION_ERROR", undefined, req);
      }

      const membershipError = await requireActiveMember(supabase, validation.value.group_id, user.id, req);
      if (membershipError) return membershipError;

      const { data, error } = await supabase
        .from("group_exchange_rates")
        .upsert({
          group_id: validation.value.group_id,
          from_currency: validation.value.from,
          to_currency: validation.value.to,
          rate: validation.value.rate,
          source: validation.value.source,
          set_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "group_id,from_currency,to_currency" })
        .select("from_currency, to_currency, rate, source, updated_at")
        .single();

      if (error) {
        return handleError(error, "saving group exchange rate", req);
      }

      return createSuccessResponse({
        from: data.from_currency,
        to: data.to_currency,
        rate: Number(data.rate),
        source: data.source,
        updated_at: data.updated_at,
      }, 200, 0, req);
    }

    if (req.method === "DELETE") {
      const deleteGroupId = groupId;
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      const validation = validateGroupRateInput({
        group_id: deleteGroupId,
        from,
        to,
        rate: 1,
        source: "group",
      });
      if (!validation.valid || !validation.value) {
        return createErrorResponse(400, validation.error || "Invalid rate pair", "VALIDATION_ERROR", undefined, req);
      }

      const membershipError = await requireActiveMember(supabase, validation.value.group_id, user.id, req);
      if (membershipError) return membershipError;

      const { error } = await supabase
        .from("group_exchange_rates")
        .delete()
        .eq("group_id", validation.value.group_id)
        .or(
          `and(from_currency.eq.${validation.value.from},to_currency.eq.${validation.value.to}),and(from_currency.eq.${validation.value.to},to_currency.eq.${validation.value.from})`,
        );

      if (error) {
        return handleError(error, "deleting group exchange rate", req);
      }

      return createEmptyResponse(204, req);
    }

    return createErrorResponse(405, "Method not allowed", "METHOD_NOT_ALLOWED", undefined, req);
  } catch (error: unknown) {
    return handleError(error, "rates handler", req);
  }
});
