export const NODE_TYPE_DIR = "1";
export const NODE_TYPE_FILE = "2";
export const SPACE_TYPE_GROUP = "1";
export const SPACE_TYPE_TEAM = "2";
export const SPACE_TYPE_CHANNEL = "3";
export function flattenFileSpaceList(list) {
    const nodes = new Map(list.map((node) => [node.node_id, node]));
    return list
        .filter((node) => node.node_type === NODE_TYPE_FILE)
        .map((node) => {
        const path = [node.name];
        let current = node;
        while (current.parent_id && nodes.has(current.parent_id)) {
            current = nodes.get(current.parent_id);
            path.unshift(current.name);
        }
        return {
            filename: path.join("/"),
            author: node.author_name ?? "",
            url: node.file_url ?? "",
            filesize: node.file_size ?? "",
        };
    });
}
export class TuituiFileSpaceApi {
    http;
    uploader;
    teams;
    constructor(http, uploader, teams) {
        this.http = http;
        this.uploader = uploader;
        this.teams = teams;
    }
    async listNodes(context) {
        const body = await this.http.post("/file_space/node/list", {
            space_id: context.spaceId,
            space_type: context.spaceType ?? SPACE_TYPE_TEAM,
        });
        return body.datas?.list ?? [];
    }
    async listFiles(context) {
        return flattenFileSpaceList(await this.listNodes(context));
    }
    async addNode(options) {
        return this.http.post("/file_space/node/add", options);
    }
    async deleteNode(options) {
        return this.http.post("/file_space/node/delete", options);
    }
    async addFile(context, cloudPath, source, uploadOptions = {}) {
        const parts = cloudPath.replace(/^\/+/, "").split("/").filter(Boolean);
        const filename = parts.pop() ?? "unnamed";
        const parentId = await this.ensureFolders(context, parts);
        const uploaded = await this.uploader.upload(source, { ...uploadOptions, filename });
        return this.addNode({
            space_id: context.spaceId,
            space_type: context.spaceType ?? SPACE_TYPE_TEAM,
            node_type: NODE_TYPE_FILE,
            name: filename,
            fid: uploaded.fid,
            parent_id: parentId,
            source: context.source ?? "",
        });
    }
    async listTeamFilesByChannel(channelId) {
        const info = await this.teams.getChannelInfo(channelId);
        return this.listFiles({ spaceId: info.team_id, spaceType: SPACE_TYPE_TEAM });
    }
    async addTeamFileByChannel(channelId, cloudPath, source, options = {}) {
        const info = await this.teams.getChannelInfo(channelId);
        const { sourcePostId, ...upload } = options;
        return this.addFile({
            spaceId: info.team_id,
            spaceType: SPACE_TYPE_TEAM,
            source: sourcePostId ?? "",
        }, cloudPath, source, upload);
    }
    async ensureFolders(context, folders) {
        if (!folders.length)
            return "";
        const nodes = await this.listNodes(context);
        let parentId = "";
        for (const name of folders) {
            let folder = nodes.find((node) => {
                return node.parent_id === parentId
                    && node.node_type === NODE_TYPE_DIR
                    && node.name === name;
            });
            if (!folder) {
                const result = await this.addNode({
                    space_id: context.spaceId,
                    space_type: context.spaceType ?? SPACE_TYPE_TEAM,
                    node_type: NODE_TYPE_DIR,
                    name,
                    parent_id: parentId,
                    source: context.source ?? "",
                });
                const resultData = result.datas;
                const nodeId = String(resultData?.node_id ?? result.node_id ?? "");
                if (!nodeId)
                    throw new Error(`[tuitui] Failed to create folder ${name}`);
                folder = { node_id: nodeId, node_type: NODE_TYPE_DIR, name, parent_id: parentId };
                nodes.push(folder);
            }
            parentId = folder.node_id;
        }
        return parentId;
    }
}
//# sourceMappingURL=filespace.js.map