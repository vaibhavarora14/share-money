import { useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getDefaultCurrency } from "../utils/currency";
import {
  clubPersonSettlements,
  groupContextsFromBalances,
  personSettlementHeadline,
  settlementSummary,
  type PersonSettlement,
  type PersonSettlementHeadline,
} from "../utils/peopleSettlements";
import { useBalances } from "./useBalances";
import { useCurrencyPreferences } from "./useCurrencyPreferences";
import { useGroups } from "./useGroups";

export type PersonSettlementView = PersonSettlement & {
  headline: PersonSettlementHeadline;
};

export function usePeopleSettlements() {
  const { user } = useAuth();
  const groupsQuery = useGroups();
  const balancesQuery = useBalances();
  const currency = useCurrencyPreferences();

  const people = useMemo(() => {
    if (!user?.id) return [] as PersonSettlementView[];
    const contexts = groupContextsFromBalances({
      groupBalances: balancesQuery.data.group_balances,
      groups: groupsQuery.data,
      prefsGroups: currency.prefs.groups,
      marketBook: currency.rateBook,
      preferredCurrency: currency.preferredCurrency,
      defaultCurrency: getDefaultCurrency(),
    });
    return clubPersonSettlements(contexts, user.id).map((person) => ({
      ...person,
      headline: personSettlementHeadline(
        person,
        currency.preferredCurrency,
        currency.rateBook
      ),
    }));
  }, [
    user?.id,
    balancesQuery.data.group_balances,
    groupsQuery.data,
    currency.prefs.groups,
    currency.rateBook,
    currency.preferredCurrency,
  ]);

  const summary = useMemo(() => settlementSummary(people), [people]);

  return {
    people,
    summary,
    preferredCurrency: currency.preferredCurrency,
    isLoading: (groupsQuery.isLoading || balancesQuery.isLoading) && people.length === 0,
    isFetching: groupsQuery.isFetching || balancesQuery.isFetching,
    error: groupsQuery.error || balancesQuery.error,
    refetch: async () => {
      await Promise.all([groupsQuery.refetch(), balancesQuery.refetch()]);
    },
  };
}
