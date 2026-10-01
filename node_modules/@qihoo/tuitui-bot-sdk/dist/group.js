/** 群创建、成员管理和群信息查询 API。 */
export class TuituiGroupApi {
    http;
    constructor(http) {
        this.http = http;
    }
    /** 创建群聊。群成员最多 100 人；服务端限制每个机器人每天最多调用 100 次。 */
    async create(options) {
        const response = await this.http.post("/group/create", {
            name: options.name,
            owner: options.owner,
            members: options.members,
        });
        return { group_id: String(response.group_id) };
    }
    /** 向群聊添加成员。 */
    async memberAdd(groupId, members) {
        return this.http.post("/group/member/add", {
            group_id: groupId,
            members,
        });
    }
    /** 从群聊移除成员。 */
    async memberRemove(groupId, members) {
        return this.http.post("/group/member/remove", {
            group_id: groupId,
            members,
        });
    }
    /** 获取当前机器人所在的群聊列表。 */
    async robotIn() {
        const response = await this.http.get("/group/robot/in");
        return groupList(response.groups);
    }
    /** 从指定群列表中返回用户和机器人共同所在的群；返回值不是布尔值。 */
    async userIsIn(options) {
        const response = await this.http.post("/group/user/isin", {
            user: options.user,
            groups: options.groups,
        });
        return groupList(response.groups);
    }
    /** 获取群成员列表，要求机器人已经在群内。 */
    async members(groupId) {
        const response = await this.http.post("/group/members", {
            group_id: groupId,
        });
        return response.members.map((member) => {
            const botInfo = member.bot_info;
            return {
                uid: String(member.uid),
                account: String(member.account),
                name: String(member.name),
                role: String(member.role),
                is_bot: member.is_bot,
                ...(botInfo ? { bot_info: { desc: String(botInfo.desc) } } : {}),
                dept: (member.dept ?? []).map(String),
            };
        });
    }
    /** 获取群名称和公告等信息，要求机器人已经在群内。 */
    async info(groupId) {
        const response = await this.http.post("/group/info", {
            group_id: groupId,
        });
        const info = response.group_info;
        return {
            id: String(info.id),
            name: String(info.name),
            announce: String(info.announce),
        };
    }
}
function groupList(value) {
    return value.map((group) => ({
        group_id: String(group.group_id),
        name: String(group.name),
    }));
}
//# sourceMappingURL=group.js.map