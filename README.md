# 把clash的规则转换为sing-box

通配符 +
通配符 ＋ 类似 DOMAIN-SUFFIX, 可以一次性匹配多个级别

＋.baidu.com 匹配 tieba.baidu.com 和 123.tieba.baidu.com 或者 baidu.com

通配符 ＋ 只能用于域名前缀匹配

通配符 .
通配符 . 可以一次性匹配多个级别

.baidu.com 匹配 tieba.baidu.com 和 123.tieba.baidu.com, 但不能匹配 baidu.com

通配符 . 只能用于域名前缀匹配

通配符 *
Clash 的通配符 * 一次只能匹配一级域名

*.baidu.com 只匹配 tieba.baidu.com 而不匹配 123.tieba.baidu.com 或者 baidu.com

*只匹配 localhost 等没有.的主机名


# Release
1. 直连规则: https://raw.githubusercontent.com/Gilfoylex/sing-box-rule-set/release/direct-site.srs
2. 代理规则: https://raw.githubusercontent.com/Gilfoylex/sing-box-rule-set/release/proxy-site.srs

## 自动更新

GitHub Actions 工作流位于 `.github/workflows/update-rules.yml`，在以下情况运行：

- 推送代码到 `main` 分支。
- 每天北京时间 08:00（UTC 00:00，GitHub 定时任务可能延迟）。
- 在仓库 Actions 页面选择 **Update sing-box rules**，点击 **Run workflow**，选择 `main` 分支手动运行。

工作流使用 Node.js 22 安装依赖并执行 `index.js`，下载最新的 Clash 规则生成 JSON，再使用 sing-box `1.14.3` 编译 SRS。全部成功后，将以下四个产物提交到已有的 `release` 分支：

- `direct-site.json`
- `proxy-site.json`
- `direct-site.srs`
- `proxy-site.srs`

仅复制并提交这四个产物，源码和工作流留在 `main` 分支。产物没有变化时不创建提交；下载、转换或编译失败时不会更新 `release`。并发运行会排队，避免同时推送。

使用 GitHub 自带的 `GITHUB_TOKEN`，无需配置额外的 Secret。需要启用仓库 Actions，并允许工作流写入仓库；如果 `release` 有分支保护规则，需要允许该工作流推送。定时任务要求工作流位于仓库默认分支 `main`。

编译器从 sing-box 官方 Releases 下载固定版本，不随仓库存储，避免占用 Git LFS 的存储和下载配额。升级编译器时，修改工作流中的 `SING_BOX_VERSION`。JSON 使用规则集格式 `version: 3`，客户端需要 sing-box 1.11.0 或更新版本。

本地生成命令：

```sh
npm ci
node index.js
sing-box rule-set compile --output direct-site.srs direct-site.json
sing-box rule-set compile --output proxy-site.srs proxy-site.json
```
