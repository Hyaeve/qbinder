# qBinder

qBinder 是 qBittorrent Docker 的助手面板，用卡片把不同 qBittorrent 账户、保存路径和标签预设绑定起来。默认登录账号和密码均为 `qBinder`，登录后可在设置页面修改。

## 功能

- 登录页与可修改的本地账号密码
- 多 qBittorrent 账户配置、连接验证后添加
- 按 qBittorrent 别名显示顶部标签页
- 每个 qBittorrent 账户下可自定义横栏
- 横栏内添加方形圆角卡片
- 卡片绑定保存路径、标签和封面
- 标签池复用，标签使用低饱和莫奈配色
- 卡片悬浮上传单个或多个 `.torrent` 文件，并按预设路径和标签添加到 qBittorrent

## 本地开发

```bash
npm install
npm run dev
```

前端开发服务默认由 Vite 提供，后端 API 默认监听 `8080`。

## Docker 运行

```bash
docker compose up -d
```

打开 `http://localhost:18086`。

数据保存在宿主机 `./data/config.json`，并挂载到容器内 `/data`，建议保留 `./data` 作为持久化目录。

## GitHub 自动构建镜像

工作流位于 `.github/workflows/docker-image.yml`。

- 推送到 `main` 分支会构建并推送 `ghcr.io/hyaeve/qbinder:latest`
- 推送 `v*.*.*` 标签会额外生成版本标签，例如 `v1.0.0`、`1.0.0`、`1.0`
- Pull Request 只构建验证，不推送镜像
- 支持 `linux/amd64` 和 `linux/arm64`

## qBittorrent 要求

- qBittorrent Web UI 可从 qBinder 容器访问
- Web UI 账号密码正确
- 如 qBittorrent 开启了 Host header 或 CSRF 限制，需要允许 qBinder 访问来源
