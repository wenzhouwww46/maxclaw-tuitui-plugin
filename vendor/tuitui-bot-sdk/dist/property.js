export class TuituiPropertyApi {
    http;
    constructor(http) {
        this.http = http;
    }
    async info() {
        const response = await this.http.get("/prop/get");
        return {
            name: response.robot_name.trim(),
            uid: String(response.robot_uid),
            account: response.robot_account.trim(),
        };
    }
    async setName(name) {
        return this.http.post("/name/modify", { name });
    }
    async setAvatar(avatar) {
        return this.http.post("/avatar/modify", { avatar });
    }
    async setWebhook(url) {
        return this.http.post("/webhook/modify", { url });
    }
    async setInteractiveUrl(url) {
        return this.http.post("/interactive_url/modify", { url });
    }
    /** 全量覆盖机器人的快捷指令。 */
    async setShortcutCommands(commands, options = {}) {
        return this.http.post("/shortcutCommand/set", {
            ...(options.noAt !== undefined ? { no_at: options.noAt } : {}),
            shortcut_cmds: commands.map((command) => ({
                command_name: command.name,
                command_content: command.content,
                command_description: command.description,
                tag: command.tag,
            })),
        });
    }
    async getShortcutCommands() {
        const response = await this.http.post("/shortcutCommand/get", {});
        return response.datas.shortcut_cmds.map((command) => ({
            name: command.command_name,
            content: command.command_content,
            description: command.command_description,
            tag: command.tag,
        }));
    }
    /** 全量覆盖机器人的工作区菜单。 */
    async setWorkspaceMenus(menus) {
        return this.http.post("/workspaceMenu/set", {
            workspace_menus: menus.map((menu) => ({
                name: menu.name,
                url: menu.url,
                open_mode: menu.openMode,
                ...(menu.appId !== undefined ? { app_id: menu.appId } : {}),
                ...(menu.visibility !== undefined ? { visibility: menu.visibility } : {}),
            })),
        });
    }
}
//# sourceMappingURL=property.js.map