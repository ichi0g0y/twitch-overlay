import { ChattersPanel } from '../ChattersPanel';
import { PRIMARY_CHAT_TAB_ID } from '../../utils/chatChannels';
import { ChatSidebarMainPanel } from './ChatSidebarMainPanel';
import { ChatSidebarTabs } from './ChatSidebarTabs';
import { ChatSidebarToolbar } from './ChatSidebarToolbar';
import { RawDataModal } from './RawDataModal';
import { UserInfoModal } from './UserInfoModal';
import type { ChatSidebarLayoutProps } from './ChatSidebarLayout.types';

export const ChatSidebarLayout = ({
  asideClass,
  sidebarStyle,
  embedded,
  wrapperClass,
  isCollapsed,
  resizeHandleSideClass,
  handleResizeStart,
  panelClass,
  activeTab,
  activeChatDisplayMode,
  messageOrderReversed,
  chattersOpen,
  channelEditorOpen,
  actionsMenuOpen,
  settingsOpen,
  popoutChatUrl,
  toggleIcon,
  fontSize,
  translationEnabled,
  notificationOverwrite,
  onEnsureIrcPreview,
  setChannelEditorOpen,
  setChannelInputError,
  setMessageOrderReversedByTab,
  setChattersOpen,
  setActiveChatDisplayMode,
  setActionsMenuOpen,
  setEmbedReloadNonceByTab,
  setSettingsOpen,
  handleOpenChatPopout,
  onFontSizeChange,
  onTranslationToggle,
  onNotificationModeToggle,
  handleToggle,
  settingsButtonRef,
  settingsPanelRef,
  actionsMenuButtonRef,
  actionsMenuPanelRef,
  tabScrollerRef,
  tabButtonRefs,
  tabs,
  connectingChannels,
  channelInput,
  channelInputError,
  setActiveTab,
  handleRemoveChannel,
  setChannelInput,
  handleAddChannel,
  embedFrames,
  activeEmbedFrame,
  listRef,
  activeMessages,
  emptyState,
  displayedItems,
  metaFontSize,
  translationFontSize,
  handleOpenUserInfo,
  handleOpenRawData,
  resolveBadgeVisual,
  richInputRef,
  postingMessage,
  isPrimaryTab,
  primaryChannelLogin,
  activeBadgeChannelLogin,
  postError,
  setPostError,
  setInputHasContent,
  sendComment,
  inputHasContent,
  fallbackChatters,
  userInfoPopup,
  handleCloseUserInfo,
  popupChannelUrl,
  popupChannelLogin,
  popupProfileCover,
  popupProfileName,
  popupProfileAvatar,
  popupProfileLogin,
  popupProfileDescription,
  userInfoLoading,
  userInfoError,
  userModerationMessage,
  userInfoCanTimeout,
  userInfoCanBlock,
  moderationUnavailableReason,
  userModerationLoading,
  runModerationAction,
  userInfoResolvedUserId,
  userInfoIdCopied,
  copyUserInfoUserId,
  userInfoCreatedAtLabel,
  userInfoFollowerCountLabel,
  userInfoTypeLabel,
  rawDataMessage,
  rawDataJson,
  rawDataCopied,
  copyRawDataJson,
  handleCloseRawData,
}: ChatSidebarLayoutProps) => {
  const ircChannelCount = tabs.filter((tab) => tab.id !== PRIMARY_CHAT_TAB_ID).length;

  return (
    <aside className={asideClass} style={embedded ? undefined : sidebarStyle}>
      <div className={wrapperClass} style={embedded ? undefined : sidebarStyle}>
        {!isCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="コメント欄の幅を調整"
            onPointerDown={handleResizeStart}
            className={`absolute top-0 ${resizeHandleSideClass} z-30 h-full w-1 cursor-col-resize touch-none`}
          >
            <div className="h-full w-full bg-transparent hover:bg-blue-200/40 dark:hover:bg-blue-500/30 transition-colors" />
          </div>
        )}
        <div className={panelClass}>
          {!isCollapsed && (
            <>
              <ChatSidebarToolbar
                activeTab={activeTab}
                activeChatDisplayMode={activeChatDisplayMode}
                messageOrderReversed={messageOrderReversed}
                ircChannelCount={ircChannelCount}
                chattersOpen={chattersOpen}
                channelEditorOpen={channelEditorOpen}
                actionsMenuOpen={actionsMenuOpen}
                settingsOpen={settingsOpen}
                popoutChatUrl={popoutChatUrl}
                embedded={embedded}
                isCollapsed={isCollapsed}
                toggleIcon={toggleIcon}
                fontSize={fontSize}
                translationEnabled={translationEnabled}
                notificationOverwrite={notificationOverwrite}
                onEnsureIrcPreview={onEnsureIrcPreview}
                setChannelEditorOpen={setChannelEditorOpen}
                setChannelInputError={setChannelInputError}
                setMessageOrderReversedByTab={setMessageOrderReversedByTab}
                setChattersOpen={setChattersOpen}
                setActiveChatDisplayMode={setActiveChatDisplayMode}
                setActionsMenuOpen={setActionsMenuOpen}
                setEmbedReloadNonceByTab={setEmbedReloadNonceByTab}
                setSettingsOpen={setSettingsOpen}
                onOpenChatPopout={handleOpenChatPopout}
                onFontSizeChange={onFontSizeChange}
                onTranslationToggle={onTranslationToggle}
                onNotificationModeToggle={onNotificationModeToggle}
                onToggleSidebar={handleToggle}
                settingsButtonRef={settingsButtonRef}
                settingsPanelRef={settingsPanelRef}
                actionsMenuButtonRef={actionsMenuButtonRef}
                actionsMenuPanelRef={actionsMenuPanelRef}
              />
              <ChatSidebarTabs
                tabScrollerRef={tabScrollerRef}
                tabButtonRefs={tabButtonRefs}
                tabs={tabs}
                activeTab={activeTab}
                connectingChannels={connectingChannels}
                channelEditorOpen={channelEditorOpen}
                channelInput={channelInput}
                channelInputError={channelInputError}
                setActiveTab={setActiveTab}
                handleRemoveChannel={handleRemoveChannel}
                setChannelInput={setChannelInput}
                setChannelInputError={setChannelInputError}
                handleAddChannel={handleAddChannel}
              />
            </>
          )}
          <ChatSidebarMainPanel
            isCollapsed={isCollapsed}
            onToggleSidebar={handleToggle}
            activeChatDisplayMode={activeChatDisplayMode}
            messageOrderReversed={messageOrderReversed}
            embedFrames={embedFrames}
            activeTab={activeTab}
            activeEmbedFrame={activeEmbedFrame}
            listRef={listRef}
            activeMessages={activeMessages}
            emptyState={emptyState}
            displayedItems={displayedItems}
            fontSize={fontSize}
            metaFontSize={metaFontSize}
            translationFontSize={translationFontSize}
            onOpenUserInfo={handleOpenUserInfo}
            onOpenRawData={handleOpenRawData}
            resolveBadgeVisual={resolveBadgeVisual}
            richInputRef={richInputRef}
            postingMessage={postingMessage}
            isPrimaryTab={isPrimaryTab}
            primaryChannelLogin={primaryChannelLogin}
            activeBadgeChannelLogin={activeBadgeChannelLogin}
            postError={postError}
            setPostError={setPostError}
            setInputHasContent={setInputHasContent}
            sendComment={sendComment}
            inputHasContent={inputHasContent}
          />
          <ChattersPanel
            open={chattersOpen && !isCollapsed && activeChatDisplayMode !== 'embed'}
            channelLogin={activeBadgeChannelLogin || undefined}
            fallbackChatters={fallbackChatters}
            onChatterClick={handleOpenUserInfo}
            onClose={() => setChattersOpen(false)}
          />
          <UserInfoModal
            open={Boolean(userInfoPopup) && !isCollapsed && activeChatDisplayMode !== 'embed'}
            userInfoPopup={userInfoPopup}
            onClose={handleCloseUserInfo}
            popupChannelUrl={popupChannelUrl}
            popupChannelLogin={popupChannelLogin}
            popupProfileCover={popupProfileCover}
            popupProfileName={popupProfileName}
            popupProfileAvatar={popupProfileAvatar}
            popupProfileLogin={popupProfileLogin}
            popupProfileDescription={popupProfileDescription}
            userInfoLoading={userInfoLoading}
            userInfoError={userInfoError}
            userModerationMessage={userModerationMessage}
            userInfoCanTimeout={userInfoCanTimeout}
            userInfoCanBlock={userInfoCanBlock}
            moderationUnavailableReason={moderationUnavailableReason}
            userModerationLoading={userModerationLoading}
            onRunModerationAction={(action) => void runModerationAction(action)}
            userInfoResolvedUserId={userInfoResolvedUserId}
            userInfoIdCopied={userInfoIdCopied}
            onCopyUserInfoUserId={() => void copyUserInfoUserId()}
            userInfoCreatedAtLabel={userInfoCreatedAtLabel}
            userInfoFollowerCountLabel={userInfoFollowerCountLabel}
            userInfoTypeLabel={userInfoTypeLabel}
          />
          <RawDataModal
            open={Boolean(rawDataMessage) && activeChatDisplayMode !== 'embed'}
            rawDataJson={rawDataJson}
            rawDataCopied={rawDataCopied}
            onCopy={() => void copyRawDataJson()}
            onClose={handleCloseRawData}
          />
        </div>
      </div>
    </aside>
  );
};
