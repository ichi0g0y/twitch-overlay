import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { FeatureStatus, TwitchUserInfo } from "../../../types";
import { subscribeIrcChannels } from "../../../utils/chatChannels";
import type { FollowedChannelRailItem } from "../../settings/FollowedChannelsRail";
import {
  FOLLOWED_RAIL_FETCH_LIMIT,
  FOLLOWED_RAIL_POLL_INTERVAL_MS,
  FOLLOWED_RAIL_SELF_VIEWER_COUNT_VISIBLE_STORAGE_KEY,
  FOLLOWED_RAIL_SIDE_STORAGE_KEY,
  WORKSPACE_SNAP_ENABLED_STORAGE_KEY,
} from "./constants";
import { fetchFollowedChannels } from "./followedChannels";
import { isPreviewIrcKind } from "./kinds";
import { writeWorkspaceCardLastPositions } from "./storage";
import type { WorkspaceCardKind, WorkspaceCardNode } from "./types";

type UseWorkspaceDataEffectsParams = {
  featureStatus: FeatureStatus | null;
  authStatus: { authenticated?: boolean } | null;
  twitchUserInfo: TwitchUserInfo | null;
  verifyingTwitch: boolean;
  verifyTwitchConfig: (options?: { suppressSuccessToast?: boolean }) => Promise<void>;
  autoVerifyTriggeredRef: MutableRefObject<boolean>;
  followedRailSide: "left" | "right";
  followedRailSelfViewerCountVisible: boolean;
  workspaceSnapEnabled: boolean;
  setFollowedChannels: Dispatch<
    SetStateAction<FollowedChannelRailItem[]>
  >;
  setFollowedChannelsError: Dispatch<SetStateAction<string>>;
  setFollowedChannelsLoading: Dispatch<SetStateAction<boolean>>;
  setNodes: Dispatch<SetStateAction<WorkspaceCardNode[]>>;
  lastWorkspaceCardPositionRef: MutableRefObject<
    Partial<Record<WorkspaceCardKind, { x: number; y: number }>>
  >;
};

export const useWorkspaceDataEffects = ({
  featureStatus,
  authStatus,
  twitchUserInfo,
  verifyingTwitch,
  verifyTwitchConfig,
  autoVerifyTriggeredRef,
  followedRailSide,
  followedRailSelfViewerCountVisible,
  workspaceSnapEnabled,
  setFollowedChannels,
  setFollowedChannelsError,
  setFollowedChannelsLoading,
  setNodes,
  lastWorkspaceCardPositionRef,
}: UseWorkspaceDataEffectsParams) => {
  useEffect(() => {
    const shouldVerify =
      Boolean(featureStatus?.twitch_configured) &&
      Boolean(authStatus?.authenticated) &&
      !twitchUserInfo &&
      !verifyingTwitch;

    if (!shouldVerify) {
      if (!featureStatus?.twitch_configured || !authStatus?.authenticated) {
        autoVerifyTriggeredRef.current = false;
      }
      return;
    }

    if (autoVerifyTriggeredRef.current) {
      return;
    }

    autoVerifyTriggeredRef.current = true;
    void verifyTwitchConfig({ suppressSuccessToast: true });
  }, [
    authStatus?.authenticated,
    featureStatus?.twitch_configured,
    twitchUserInfo,
    verifyingTwitch,
    verifyTwitchConfig,
    autoVerifyTriggeredRef,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FOLLOWED_RAIL_SIDE_STORAGE_KEY, followedRailSide);
  }, [followedRailSide]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      FOLLOWED_RAIL_SELF_VIEWER_COUNT_VISIBLE_STORAGE_KEY,
      followedRailSelfViewerCountVisible ? "true" : "false",
    );
  }, [followedRailSelfViewerCountVisible]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      WORKSPACE_SNAP_ENABLED_STORAGE_KEY,
      workspaceSnapEnabled ? "true" : "false",
    );
  }, [workspaceSnapEnabled]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const canFetch =
      Boolean(featureStatus?.twitch_configured) &&
      Boolean(authStatus?.authenticated);
    if (!canFetch) {
      setFollowedChannels([]);
      setFollowedChannelsError("");
      setFollowedChannelsLoading(false);
      return () => {};
    }

    const loadFollowedChannels = async (showLoading: boolean) => {
      if (showLoading) {
        setFollowedChannelsLoading(true);
      }
      try {
        const normalized = await fetchFollowedChannels(FOLLOWED_RAIL_FETCH_LIMIT);
        if (!cancelled) {
          setFollowedChannels(normalized);
          setFollowedChannelsError("");
        }
      } catch {
        if (!cancelled) {
          setFollowedChannelsError("取得失敗");
        }
      } finally {
        if (!cancelled) {
          setFollowedChannelsLoading(false);
        }
      }
    };

    void loadFollowedChannels(true);
    timer = window.setInterval(() => {
      void loadFollowedChannels(false);
    }, FOLLOWED_RAIL_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
    };
  }, [
    authStatus?.authenticated,
    featureStatus?.twitch_configured,
    setFollowedChannels,
    setFollowedChannelsError,
    setFollowedChannelsLoading,
  ]);

  useEffect(() => {
    return subscribeIrcChannels((channels) => {
      const connected = new Set(
        channels
          .map((channel) => channel.trim().toLowerCase())
          .filter((channel) => channel !== ""),
      );
      setNodes((current) => {
        const removedNodes = current.filter(
          (node) =>
            isPreviewIrcKind(node.data.kind) &&
            !connected.has(
              node.data.kind.slice("preview-irc:".length).trim().toLowerCase(),
            ),
        );
        if (removedNodes.length === 0) return current;

        const removedIds = new Set(removedNodes.map((node) => node.id));
        const nextPositions = { ...lastWorkspaceCardPositionRef.current };
        for (const node of removedNodes) {
          nextPositions[node.data.kind] = {
            x: node.position.x,
            y: node.position.y,
          };
        }
        lastWorkspaceCardPositionRef.current = nextPositions;
        writeWorkspaceCardLastPositions(nextPositions);

        return current.filter((node) => !removedIds.has(node.id));
      });
    });
  }, [lastWorkspaceCardPositionRef, setNodes]);
};
