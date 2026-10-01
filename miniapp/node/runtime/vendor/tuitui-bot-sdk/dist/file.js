export class TuituiFileApi {
    http;
    uploader;
    constructor(http, uploader) {
        this.http = http;
        this.uploader = uploader;
    }
    async upload(source, options) {
        return this.uploader.upload(source, options);
    }
    /**
     * 查询文件的临时下载 URL。
     *
     * fid 不存在时，Promise 会以服务端返回的 `TuituiApiError` 拒绝。
     */
    async query(fid) {
        const urls = await this.batchQuery([fid]);
        return urls[fid];
    }
    /**
     * 批量查询文件的临时下载 URL。
     *
     * 部分 fid 存在时，只返回存在文件的 `fid -> URL` 映射，不存在的 fid 不会出现在结果中。
     * 所有 fid 都不存在时，Promise 会以服务端返回的 `TuituiApiError` 拒绝。
     */
    async batchQuery(fids) {
        const response = await this.http.post("/media/fetch", {
            media_ids: fids,
        });
        return response.media_url;
    }
}
//# sourceMappingURL=file.js.map