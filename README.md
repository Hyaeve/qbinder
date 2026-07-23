# qBinder

qBinder 是 qBittorrent Docker 的种子快捷分类添加助手。它用卡片把 qBittorrent 账户、横栏、保存路径、标签和封面绑定起来，上传 `.torrent` 时自动套用对应预设。

当前版本：v1.0

## 功能

- 本地登录保护，默认账号和密码均为 `qBinder`，可在设置页修改。
- 支持配置多个 qBittorrent Web UI 账户，添加前可验证连接。
- 按 qBittorrent 别名显示账户标签页，不同账户拥有独立横栏和卡片。
- 支持新增、双击编辑、删除和拖拽排序横栏。
- 支持卡片绑定名称、保存路径、标签和封面。
- 卡片右键进入设置，可修改卡片、删除卡片、维护标签池。
- 标签池可复用，标签和莫奈封面使用低饱和配色。
- 卡片支持上传单个或多个 `.torrent` 文件，并按预设保存路径和标签添加到 qBittorrent。
- 设置页支持配置备份导出和备份恢复，备份内容包含 qB 账户、横栏、卡片和标签池。
- 后端会记录 qB 验证失败、登录失败和 API 调用错误到容器 stdout，便于排查部署问题。

## Docker Compose

推荐使用 Docker Compose 运行：

```yaml
services:
  qbinder:
    image: ghcr.io/hyaeve/qbinder:latest
    container_name: qBinder
    network_mode: bridge
    ports:
      - "127.0.0.1:18086:18086"
    volumes:
      - ./data:/data
    environment:
      TZ: Asia/Shanghai
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    mem_limit: 256m
    cpus: 1.0
    pids_limit: 100
    restart: unless-stopped
```

启动：

```bash
docker compose up -d
```

打开 `http://localhost:18086`，使用默认账号 `qBinder` / `qBinder` 登录后先到设置页修改登录密码，再添加 qBittorrent 连接。

默认端口仅绑定至本机回环地址，适合经 HTTPS 反向代理对外发布；若确实需要直接暴露到局域网，将端口映射改为 `18086:18086`，并使用防火墙限制可信来源。

数据保存在宿主机 `./data/config.json`，容器内路径为 `/data/config.json`。配置包含 qB 登录凭据和会话信息，应用会以仅所有者可读写的权限保存；请同时限制宿主机 `./data` 目录访问权限。升级镜像或重建容器前保留 `./data` 目录即可保留配置。

## 安全与资源限制

- 服务为请求头、请求体、JSON 和 qB 响应设置了大小与超时上限；种子上传最多 50 个文件、总大小 32 MB。
- 种子转发采用流式管道，不再将完整 multipart 上传内容复制到应用内存。
- 容器以非 root 用户运行，移除全部 Linux capabilities，并禁止获取新权限。
- Compose 默认限制为 256 MB 内存、1 个 CPU 和 100 个进程；可按实际并发量调整。
- 登录密码升级为 Argon2id 哈希。现有 SHA-256/bcrypt 配置会在首次成功登录时自动迁移为 Argon2id。

## qBittorrent 连接要求

- qBittorrent Web UI 必须能从 qBinder 容器访问。
- Web UI 账号密码正确，并允许通过 Web API 登录。
- 如果 qBittorrent 开启了 Host header、CSRF 或反向代理限制，需要允许 qBinder 容器来源访问。
- 在 Docker bridge 网络下连接宿主机 qBittorrent 时，请填写容器可访问的宿主机地址，而不是仅在宿主机本机有效的 `localhost`。

## 本地开发

前端使用 Vue + Vite，后端使用 Go 标准库。

安装前端依赖并启动 Vite：

```bash
npm install
npm run dev
```

另开终端启动后端：

```bash
go run ./server
```

前端开发服务会把 `/api` 代理到 Go 后端，后端默认监听 `18086`。

生产构建：

```bash
npm run build
go test ./...
```

## GitHub 自动构建镜像

工作流位于 `.github/workflows/docker-image.yml`。

- 推送到 `main` 分支会构建并推送 `ghcr.io/hyaeve/qbinder:latest`。
- 推送 `v*.*` 或 `v*.*.*` 标签会额外生成版本标签，例如 `v1.0`、`1.0`、`v1.0.0`、`1.0.0`。
- Pull Request 只构建验证，不推送镜像。
- 镜像支持 `linux/amd64` 和 `linux/arm64`。
