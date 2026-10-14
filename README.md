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
- 每周一北京时间 08:00（UTC 周一 00:00，GitHub 定时任务可能延迟）。
- 在仓库 Actions 页面选择 **Update sing-box rules**，点击 **Run workflow**，选择 `main` 分支手动运行。

工作流使用 Node.js 22 安装依赖并执行 `index.js`，下载最新的 Clash 规则生成 JSON，并下载中国大陆 IPv4、IPv6 网段生成 nftables 集合，再使用 sing-box `1.14.3` 编译 SRS。全部成功后，将以下五个产物提交到已有的 `release` 分支：

- `direct-site.json`
- `proxy-site.json`
- `direct-site.srs`
- `proxy-site.srs`
- `mainland-ip-sets.nft`

仅复制并提交这五个产物，源码和工作流留在 `main` 分支。产物没有变化时不创建提交；下载、转换或编译失败时不会更新 `release`。并发运行会排队，避免同时推送。

使用 GitHub 自带的 `GITHUB_TOKEN`，无需配置额外的 Secret。需要启用仓库 Actions，并允许工作流写入仓库；如果 `release` 有分支保护规则，需要允许该工作流推送。定时任务要求工作流位于仓库默认分支 `main`。

编译器从 sing-box 官方 Releases 下载固定版本，不随仓库存储，避免占用 Git LFS 的存储和下载配额。升级编译器时，修改工作流中的 `SING_BOX_VERSION`。JSON 使用规则集格式 `version: 3`，客户端需要 sing-box 1.11.0 或更新版本。

### GitHub Free 费用

本仓库为公开仓库，工作流使用标准 `ubuntu-latest` 运行器，按 [GitHub Actions 官方计费规则](https://docs.github.com/en/billing/concepts/product-billing/github-actions)运行免费。五个产物直接提交到 Git 分支，不使用 Actions 产物存储或 Git LFS；npm 缓存使用每个仓库自带的 10 GB 免费缓存额度，当前两个依赖的缓存远低于该额度。

如果以后改为私有仓库，GitHub Free 每月包含 2,000 分钟标准运行器额度，与账号内其他私有仓库共享。每周定时运行 4～5 次、每次最多 15 分钟，定时部分每月最多使用 75 分钟；推送或手动触发的运行会额外计入。超出免费额度并启用付费使用时才可能产生费用。

本地生成命令：

```sh
npm ci
node index.js
sing-box rule-set compile --output direct-site.srs direct-site.json
sing-box rule-set compile --output proxy-site.srs proxy-site.json
```

### 中国大陆 IP 集合

`node index.js` 会从 [homeproxy china_ip4.txt](https://github.com/immortalwrt/homeproxy/blob/master/root/etc/homeproxy/resources/china_ip4.txt) 和 [homeproxy china_ip6.txt](https://github.com/immortalwrt/homeproxy/blob/master/root/etc/homeproxy/resources/china_ip6.txt) 下载网段，校验地址类型和 CIDR 前缀长度，生成根目录下的 `mainland-ip-sets.nft`。任意列表为空、格式错误或下载失败时，程序以失败状态退出，不覆盖已有的 nft 文件。

该文件定义 `mainland_ipv4` 和 `mainland_ipv6` 两个集合，包含 `flags interval` 和 `auto-merge`，不包含表或链。发布后的下载地址为：

https://raw.githubusercontent.com/Gilfoylex/sing-box-rule-set/release/mainland-ip-sets.nft

在 OpenWrt 上保存为 `/etc/sing-box/nftables/mainland-ip-sets.nft`，删除原 TProxy 文件中的这两个集合定义，在引用它们的链之前加入：

```nft
include "/etc/sing-box/nftables/mainland-ip-sets.nft"
```

这是表内部的配置片段，需由 fw4 加载，不能单独执行 `nft -f mainland-ip-sets.nft`。只替换磁盘文件不会更新运行中的集合，需要重载防火墙或另行执行集合热更新。
