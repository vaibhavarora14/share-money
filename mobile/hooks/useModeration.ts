import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ActivityFeedResponse } from "../types";
import { fetchWithAuth } from "../utils/api";
import { queryKeys } from "./queryKeys";

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
      const queryKey = queryKeys.activity(groupId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ActivityFeedResponse>(queryKey);

      queryClient.setQueryData<ActivityFeedResponse>(queryKey, (current) => {
        if (!current) return current;
        const activities = current.activities.filter(
          (activity) => activity.changed_by.id !== input.targetUserId
        );
        return {
          ...current,
          activities,
          total: Math.max(0, current.total - (current.activities.length - activities.length)),
        };
      });

      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.activity(groupId), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activity(groupId) });
    },
  });

  return {
    report: reportMutation.mutateAsync,
    block: blockMutation.mutateAsync,
    isReporting: reportMutation.isPending,
    isBlocking: blockMutation.isPending,
  };
}
