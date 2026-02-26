import type { ComponentProps, FC } from "react";
import { ChatSidebar } from "../../ChatSidebar";
import { FollowedChannelsRail } from "../../settings/FollowedChannelsRail";
import { StatusTopBar } from "../topbar/StatusTopBar";

type FollowedChannelsRailProps = ComponentProps<typeof FollowedChannelsRail>;
type ChatSidebarProps = ComponentProps<typeof ChatSidebar>;
type StatusTopBarProps = ComponentProps<typeof StatusTopBar>;

type WorkspaceSidePanelsProps = {
  railProps: Omit<FollowedChannelsRailProps, "chatPanel">;
  chatSidebarProps: ChatSidebarProps;
  statusTopBarProps: StatusTopBarProps;
};

export const WorkspaceSidePanels: FC<WorkspaceSidePanelsProps> = ({
  railProps,
  chatSidebarProps,
  statusTopBarProps,
}) => {
  return (
    <>
      <FollowedChannelsRail
        {...railProps}
        chatPanel={<ChatSidebar {...chatSidebarProps} />}
      />
      <StatusTopBar {...statusTopBarProps} />
    </>
  );
};
