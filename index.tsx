/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, useSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import type { Channel, User } from "@vencord/discord-types";
import { findByPropsLazy, findComponentByCodeLazy } from "@webpack";
import {
    ChannelStore,
    Menu,
    PermissionsBits,
    PermissionStore,
    React,
    Toasts,
    UserStore
} from "@webpack/common";
import type { PropsWithChildren, SVGProps } from "react";

const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_TOP:", '.iconBadge,"top"');

interface BaseIconProps extends IconProps {
    viewBox: string;
}

interface IconProps extends SVGProps<SVGSVGElement> {
    className?: string;
    height?: string | number;
    width?: string | number;
}

function Icon({
    height = 24,
    width = 24,
    className,
    children,
    viewBox,
    ...svgProps
}: PropsWithChildren<BaseIconProps>) {
    return (
        <svg
            className={classes(className, "vc-icon")}
            role="img"
            width={width}
            height={height}
            viewBox={viewBox}
            {...svgProps}
        >
            {children}
        </svg>
    );
}

function FollowIcon(props: IconProps) {
    return (
        <Icon
            {...props}
            className={classes(props.className, "vc-follow-icon")}
            viewBox="0 -960 960 960"
        >
            <path
                fill="currentColor"
                d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Zm0-108q96-86 158-147.5t98-107q36-45.5 50-81t14-70.5q0-60-40-100t-100-40q-47 0-87 26.5T518-680h-76q-15-41-55-67.5T300-774q-60 0-100 40t-40 100q0 35 14 70.5t50 81q36 45.5 98 107T480-228Zm0-273Z"
            />
        </Icon>
    );
}

function UnfollowIcon(props: IconProps) {
    return (
        <Icon
            {...props}
            className={classes(props.className, "vc-unfollow-icon")}
            viewBox="0 -960 960 960"
        >
            <path
                fill="currentColor"
                d="m480-120-58-52q-101-91-167-157T150-447.5Q111-500 95.5-544T80-634q0-94 63-157t157-63q52 0 99 22t81 62q34-40 81-62t99-22q94 0 157 63t63 157q0 46-15.5 90T810-447.5Q771-395 705-329T538-172l-58 52Z"
            />
        </Icon>
    );
}

interface VoiceState {
    userId: string;
    channelId?: string;
    oldChannelId?: string;
    deaf: boolean;
    mute: boolean;
    selfDeaf: boolean;
    selfMute: boolean;
    selfStream: boolean;
    selfVideo: boolean;
    sessionId: string;
    suppress: boolean;
    requestToSpeakTimestamp: string | null;
}

export const settings = definePluginSettings({
    disconnectUserId: {
        type: OptionType.STRING,
        description: "Target user ID to auto-disconnect",
        restartNeeded: false,
        hidden: true,
        default: "",
    },
    serverMuteUserId: {
        type: OptionType.STRING,
        description: "Target user ID to auto-server-mute",
        restartNeeded: false,
        hidden: true,
        default: "",
    },
    serverDeafenUserId: {
        type: OptionType.STRING,
        description: "Target user ID to auto-server-deafen",
        restartNeeded: false,
        hidden: true,
        default: "",
    },
});

const Auth: { getToken: () => string; } = findByPropsLazy("getToken");

interface GuildMemberPatchAction {
    verb: string;
    pastTense: string;
    presentParticiple: string;
}

async function patchGuildMember(guildId: string, userId: string, body: Record<string, unknown>, action: GuildMemberPatchAction) {
    const token = Auth?.getToken?.();
    if (!token) {
        Toasts.show({
            message: `Cannot get auth token to ${action.verb} user`,
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE
        });
        return;
    }

    try {
        const response = await fetch(`/api/v9/guilds/${guildId}/members/${userId}`, {
            method: "PATCH",
            headers: {
                "Authorization": token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body)
        });

        if (response.ok) {
            Toasts.show({
                message: `User ${action.pastTense}`,
                id: Toasts.genId(),
                type: Toasts.Type.SUCCESS
            });
        } else {
            Toasts.show({
                message: `Failed to ${action.verb} user (${response.status})`,
                id: Toasts.genId(),
                type: Toasts.Type.FAILURE
            });
        }
    } catch (error) {
        Toasts.show({
            message: `Network error while ${action.presentParticiple} user`,
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE
        });
    }
}

function disconnectGuildMember(guildId: string, userId: string) {
    return patchGuildMember(guildId, userId, { channel_id: null }, {
        verb: "disconnect",
        pastTense: "disconnected from voice",
        presentParticiple: "disconnecting"
    });
}

function serverMuteGuildMember(guildId: string, userId: string) {
    return patchGuildMember(guildId, userId, { mute: true }, {
        verb: "server mute",
        pastTense: "server muted",
        presentParticiple: "server muting"
    });
}

function serverDeafenGuildMember(guildId: string, userId: string) {
    return patchGuildMember(guildId, userId, { deaf: true }, {
        verb: "server deafen",
        pastTense: "server deafened",
        presentParticiple: "server deafening"
    });
}

interface UserContextProps {
    channel: Channel;
    guildId?: string;
    user: User;
}

const UserContext: NavContextMenuPatchCallback = (children, { user }: UserContextProps) => {
    if (!user || user.id === UserStore.getCurrentUser().id) return;
    const isDisconnectActive = settings.store.disconnectUserId === user.id;
    const isServerMuteActive = settings.store.serverMuteUserId === user.id;
    const isServerDeafenActive = settings.store.serverDeafenUserId === user.id;

    children.splice(-1, 0, (
        <Menu.MenuGroup key="disconnect-user-group">
            <Menu.MenuItem
                id="disconnect-user"
                label="Disconnect user"
                action={() => {
                    settings.store.disconnectUserId = isDisconnectActive ? "" : user.id;
                }}
                icon={isDisconnectActive ? UnfollowIcon : FollowIcon}
            />
            <Menu.MenuItem
                id="server-mute-user"
                label="Server mute user"
                action={() => {
                    settings.store.serverMuteUserId = isServerMuteActive ? "" : user.id;
                }}
                icon={isServerMuteActive ? UnfollowIcon : FollowIcon}
            />
            <Menu.MenuItem
                id="server-deafen-user"
                label="Server deafen user"
                action={() => {
                    settings.store.serverDeafenUserId = isServerDeafenActive ? "" : user.id;
                }}
                icon={isServerDeafenActive ? UnfollowIcon : FollowIcon}
            />
        </Menu.MenuGroup>
    ));
};

export default definePlugin({
    name: "DisconnectUser",
    description: "Adds a context menu entry to auto-disconnect a user when they join voice",
    authors: [{ id: 1242811215110082584n, name: "Jeasus" }, { name: "emirvaki", id: 1357545010848989247n }],

    settings,
    patches: [
        {
            find: "\"avatarContainerClass\",\"userNameClassName\"",
            replacement: {
                match: /(\((\i),\i\){.+?\.flipped])(:\i}\),children:\[)/,
                replace: "$1$3$self.renderButtons($2?.user),"
            }
        },
        {
            find: "toolbar:function",
            replacement: {
                match: /(function \i\(\i\){)(.{1,200}toolbar.{1,100}mobileToolbar)/,
                replace: "$1$self.addIconToToolBar(arguments[0]);$2"
            }
        },
    ],

    contextMenus: {
        "user-context": UserContext
    },

    flux: {
        VOICE_STATE_UPDATES({ voiceStates }: { voiceStates: VoiceState[]; }) {
            const { disconnectUserId, serverMuteUserId, serverDeafenUserId } = settings.store;
            if (!disconnectUserId && !serverMuteUserId && !serverDeafenUserId) return;

            for (const { userId, channelId, oldChannelId } of voiceStates) {
                if (userId !== disconnectUserId && userId !== serverMuteUserId && userId !== serverDeafenUserId) continue;
                if (channelId && channelId !== oldChannelId) {
                    const channel = ChannelStore.getChannel(channelId);
                    if (!channel) continue;
                    const guildId = (channel as any).guild_id ?? (channel as any).guildId;
                    if (!guildId) continue;

                    if (userId === disconnectUserId) {
                        if (!PermissionStore.can(PermissionsBits.MOVE_MEMBERS, channel)) {
                            Toasts.show({
                                message: "Missing MOVE_MEMBERS permission to disconnect user",
                                id: Toasts.genId(),
                                type: Toasts.Type.FAILURE
                            });
                        } else {
                            void disconnectGuildMember(guildId, userId);
                        }
                    }

                    if (userId === serverMuteUserId) {
                        if (!PermissionStore.can(PermissionsBits.MUTE_MEMBERS, channel)) {
                            Toasts.show({
                                message: "Missing MUTE_MEMBERS permission to server mute user",
                                id: Toasts.genId(),
                                type: Toasts.Type.FAILURE
                            });
                        } else {
                            void serverMuteGuildMember(guildId, userId);
                        }
                    }

                    if (userId === serverDeafenUserId) {
                        if (!PermissionStore.can(PermissionsBits.DEAFEN_MEMBERS, channel)) {
                            Toasts.show({
                                message: "Missing DEAFEN_MEMBERS permission to server deafen user",
                                id: Toasts.genId(),
                                type: Toasts.Type.FAILURE
                            });
                        } else {
                            void serverDeafenGuildMember(guildId, userId);
                        }
                    }
                }
            }
        },
    },

    FollowIndicator() {
        const {
            plugins: {
                DisconnectUser: {
                    disconnectUserId,
                    serverMuteUserId,
                    serverDeafenUserId
                }
            }
        } = useSettings([
            "plugins.DisconnectUser.disconnectUserId",
            "plugins.DisconnectUser.serverMuteUserId",
            "plugins.DisconnectUser.serverDeafenUserId"
        ]);

        const activeActions = [
            disconnectUserId && `Disconnect: ${UserStore.getUser(disconnectUserId)?.username ?? disconnectUserId}`,
            serverMuteUserId && `Server mute: ${UserStore.getUser(serverMuteUserId)?.username ?? serverMuteUserId}`,
            serverDeafenUserId && `Server deafen: ${UserStore.getUser(serverDeafenUserId)?.username ?? serverDeafenUserId}`
        ].filter(Boolean);

        if (activeActions.length) {
            return (
                <HeaderBarIcon
                    tooltip={`${activeActions.join("\n")} (right-click to disable all)`}
                    icon={UnfollowIcon}
                    onClick={() => { }}
                    onContextMenu={e => {
                        e.preventDefault();
                        settings.store.disconnectUserId = "";
                        settings.store.serverMuteUserId = "";
                        settings.store.serverDeafenUserId = "";
                    }}
                />
            );
        }

        return null;
    },

    addIconToToolBar(e: { toolbar: React.ReactNode[] | React.ReactNode; }) {
        const icon = (
            <ErrorBoundary noop={true} key="disconnect-indicator">
                <this.FollowIndicator />
            </ErrorBoundary>
        );

        if (Array.isArray(e.toolbar)) {
            // Toolbar array ise ikonları sona ekle ki başka plugin ikonları da kalır
            e.toolbar.push(icon);
        } else {
            // Tek node ise array yapıp önce kendi ikonunu ekle
            e.toolbar = [icon, e.toolbar];
        }
    },
});
