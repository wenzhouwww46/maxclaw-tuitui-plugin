import { resolveTuituiConfig } from "./config.js";
import { TuituiAgentApi } from "./agent.js";
import { TuituiToApi } from "./to-target.js";
import { TuituiEventApi } from "./event.js";
import { TuituiFileApi } from "./file.js";
import { TuituiFileSpaceApi } from "./filespace.js";
import { TuituiGroupApi } from "./group.js";
import { TuituiHttpClient } from "./http.js";
import { TuituiImApi } from "./im.js";
import { TuituiPropertyApi } from "./property.js";
import { TuituiRecordsApi } from "./records.js";
import { TuituiTeamsApi } from "./teams.js";
import { TuituiUploader } from "./upload.js";
export class TuituiBotClient {
    config;
    http;
    im;
    to;
    teams;
    file;
    fileSpace;
    group;
    event;
    property;
    agent;
    constructor(appId, appSecret, options = {}) {
        this.config = resolveTuituiConfig(appId, appSecret, options);
        this.http = new TuituiHttpClient(this.config);
        const uploader = new TuituiUploader(this.http, this.config);
        const records = new TuituiRecordsApi(this.http);
        this.to = new TuituiToApi();
        this.im = new TuituiImApi(this.http, uploader, records);
        this.teams = new TuituiTeamsApi(this.http, uploader);
        this.file = new TuituiFileApi(this.http, uploader);
        this.fileSpace = new TuituiFileSpaceApi(this.http, uploader, this.teams);
        this.group = new TuituiGroupApi(this.http);
        this.event = new TuituiEventApi(this.config, this.teams);
        this.property = new TuituiPropertyApi(this.http);
        this.agent = new TuituiAgentApi(this.http, this.config);
    }
    async request(endpoint, payload, options = {}) {
        return options.method === "GET"
            ? this.http.get(endpoint)
            : this.http.post(endpoint, payload);
    }
}
//# sourceMappingURL=client.js.map