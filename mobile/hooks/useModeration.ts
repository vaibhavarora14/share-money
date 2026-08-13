import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityFeedResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { filterActivityQueriesForBlockedUser } from "./moderationCache";

export type ReportReason =
  | "spam"
  | "harassment"
  | "hate_speech"
  | "sexual_content"
  | "violence"
  | "other";

export type ReportContentType =
  | "activity"
  | "transaction"
  | "settlement"
  | "profile";

export interface SafetyTarget {
  targetUserId: string;
  targetName: string;
  contentType: ReportContentType;
  contentId: string;
}

interface ReportInput extends SafetyTarget {
  reason: ReportReason;
  details?: string;
}

async function submitModerationAction(body: Record<string, unknown>) {
  const response = await fetchWithAuth("/moderation", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.json();
}

export function useModeration(groupId: string) {
  const queryClient = useQueryClient();

  const reportMutation = useMutation({
    mutationFn: (input: ReportInput) =>
      submitModerationAction({
        action: "report",
        group_id: groupId,
        target_user_id: input.targetUserId,
        content_type: input.contentType,
        content_id: input.contentId,
        reason: input.reason,
        details: input.details,
      }),
  });

  const blockMutation = useMutation({
    mutationFn: (input: SafetyTarget) =>
      submitModerationAction({
        action: "block",
        group_id: groupId,
        target_user_id: input.targetUserId,
        content_type: input.contentType,
        content_id: input.contentId,
        reason: "harassment",
      }),
    onMutate: async (input) => {
      const activityQueryKey = ["activity"] as const;
      await queryClient.cancelQueries({ queryKey: activityQueryKey });
      const previous = queryClient.getQueriesData<ActivityFeedResponse>({
        queryKey: activityQueryKey,
      });

      for (const [queryKey, updated] of filterActivityQueriesForBlockedUser(
        previous,
        input.targetUserId
      )) {
        queryClient.setQueryData(queryKey, updated);
      }

      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, previous] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  return {
    report: reportMutation.mutateAsync,
    block: blockMutation.mutateAsync,
    isReporting: reportMutation.isPending,
    isBlocking: blockMutation.isPending,
  };
}
