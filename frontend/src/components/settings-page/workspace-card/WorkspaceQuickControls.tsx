import { type ReactFlowInstance } from "@xyflow/react";
import { Magnet, Maximize2, Mouse, Settings2 } from "lucide-react";
import type {
  Dispatch,
  FC,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";
import { WorkspacePanningSettings } from "../../settings/WorkspacePanningSettings";
import { QUICK_CONTROLS_HIDE_DELAY_MS } from "./constants";
import type { WorkspaceCardNode } from "./types";

type WorkspaceQuickControlsProps = {
  shouldShowQuickControls: boolean;
  leftOffset: number;
  panningSettingsOpen: boolean;
  setPanningSettingsOpen: Dispatch<SetStateAction<boolean>>;
  quickControlsHideTimerRef: MutableRefObject<number | null>;
  setIsQuickControlsHovered: (hovered: boolean) => void;
  setIsWorkspaceControlsVisible: (visible: boolean) => void;
  collapseExpandedPreviewViewport: () => void;
  workspaceFlowInstanceRef: RefObject<ReactFlowInstance<WorkspaceCardNode> | null>;
  setWorkspaceSnapEnabled: Dispatch<SetStateAction<boolean>>;
  workspaceSnapEnabled: boolean;
  scrollModeEnabled: boolean;
  handleSettingChange: (
    key: string,
    value: string | boolean,
    saveImmediately?: boolean,
  ) => void;
  panActivationKeyCode: string;
  zoomActivationKeyCode: string;
  previewPortalEnabled: boolean;
};

export const WorkspaceQuickControls: FC<WorkspaceQuickControlsProps> = ({
  shouldShowQuickControls,
  leftOffset,
  panningSettingsOpen,
  setPanningSettingsOpen,
  quickControlsHideTimerRef,
  setIsQuickControlsHovered,
  setIsWorkspaceControlsVisible,
  collapseExpandedPreviewViewport,
  workspaceFlowInstanceRef,
  setWorkspaceSnapEnabled,
  workspaceSnapEnabled,
  scrollModeEnabled,
  handleSettingChange,
  panActivationKeyCode,
  zoomActivationKeyCode,
  previewPortalEnabled,
}) => {
  return (
    <>
      <div
        className={`fixed bottom-3 z-[1700] flex flex-col overflow-hidden rounded-md border border-gray-700 bg-gray-900/90 shadow-lg transition ${
          shouldShowQuickControls
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-2 opacity-0 pointer-events-none"
        }`}
        style={{ left: `${leftOffset}px` }}
        onMouseEnter={() => {
          if (quickControlsHideTimerRef.current !== null) {
            window.clearTimeout(quickControlsHideTimerRef.current);
            quickControlsHideTimerRef.current = null;
          }
          setIsQuickControlsHovered(true);
          setIsWorkspaceControlsVisible(true);
        }}
        onMouseLeave={() => {
          setIsQuickControlsHovered(false);
          if (panningSettingsOpen) return;
          if (quickControlsHideTimerRef.current !== null) {
            window.clearTimeout(quickControlsHideTimerRef.current);
          }
          quickControlsHideTimerRef.current = window.setTimeout(() => {
            setIsWorkspaceControlsVisible(false);
            quickControlsHideTimerRef.current = null;
          }, QUICK_CONTROLS_HIDE_DELAY_MS);
        }}
      >
        <button
          type="button"
          onClick={() => {
            collapseExpandedPreviewViewport();
            void workspaceFlowInstanceRef.current?.zoomIn({ duration: 120 });
          }}
          className="inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
          title="ズームイン"
          aria-label="ズームイン"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            collapseExpandedPreviewViewport();
            void workspaceFlowInstanceRef.current?.zoomOut({ duration: 120 });
          }}
          className="inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 text-sm text-gray-200 hover:bg-gray-800"
          title="ズームアウト"
          aria-label="ズームアウト"
        >
          -
        </button>
        <button
          type="button"
          onClick={() => {
            collapseExpandedPreviewViewport();
            void workspaceFlowInstanceRef.current?.fitView({ duration: 150 });
          }}
          className="inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 text-gray-200 hover:bg-gray-800"
          title="全体表示"
          aria-label="全体表示"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setWorkspaceSnapEnabled((current) => !current)}
          className={`inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 hover:bg-gray-800 ${
            workspaceSnapEnabled ? "text-emerald-300" : "text-gray-400"
          }`}
          title={workspaceSnapEnabled ? "スナップ: ON" : "スナップ: OFF"}
          aria-label={
            workspaceSnapEnabled
              ? "スナップをオフにする"
              : "スナップをオンにする"
          }
        >
          <Magnet className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            handleSettingChange(
              "WORKSPACE_SCROLL_MODE_ENABLED",
              !scrollModeEnabled,
            )
          }
          className={`inline-flex h-8 w-8 items-center justify-center border-b border-gray-700 hover:bg-gray-800 ${
            scrollModeEnabled ? "text-sky-300" : "text-gray-400"
          }`}
          title={scrollModeEnabled ? "スクロールモード: ON" : "スクロールモード: OFF"}
          aria-label={
            scrollModeEnabled
              ? "スクロールモードをオフにする"
              : "スクロールモードをオンにする"
          }
        >
          <Mouse className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setPanningSettingsOpen((current) => !current)}
          className={`inline-flex h-8 w-8 items-center justify-center hover:bg-gray-800 ${
            panningSettingsOpen ? "text-blue-300" : "text-gray-400"
          }`}
          title="パン設定"
          aria-label="パン設定を開く"
        >
          <Settings2 className="h-4 w-4" />
        </button>
      </div>
      {panningSettingsOpen && (
        <WorkspacePanningSettings
          panActivationKeyCode={panActivationKeyCode}
          onPanActivationKeyCodeChange={(value) =>
            handleSettingChange("WORKSPACE_PAN_ACTIVATION_KEY", value)
          }
          zoomActivationKeyCode={zoomActivationKeyCode}
          onZoomActivationKeyCodeChange={(value) =>
            handleSettingChange("WORKSPACE_ZOOM_MODIFIER_KEY", value)
          }
          snapModeEnabled={workspaceSnapEnabled}
          onSnapModeEnabledChange={setWorkspaceSnapEnabled}
          scrollModeEnabled={scrollModeEnabled}
          onScrollModeEnabledChange={(enabled) =>
            handleSettingChange("WORKSPACE_SCROLL_MODE_ENABLED", enabled)
          }
          previewPortalEnabled={previewPortalEnabled}
          onPreviewPortalEnabledChange={(enabled) =>
            handleSettingChange("WORKSPACE_PREVIEW_PORTAL_ENABLED", enabled)
          }
          leftOffset={leftOffset + 40}
          onClose={() => setPanningSettingsOpen(false)}
        />
      )}
    </>
  );
};
