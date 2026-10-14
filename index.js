import fs from 'node:fs/promises'
import path from 'node:path'
import { isIP } from 'node:net'
import { load } from 'js-yaml'


function convertClashPayload(payload) {
  const domain = [];
  const domain_suffix = [];
  const domain_regex = [];

  for (const raw of payload) {
    if (typeof raw !== "string") continue;

    const value = raw.trim();
    if (!value) continue;

    // +.example.com
    // .example.com
    // → domain_suffix
    if (value.startsWith("+.")) {
      domain_suffix.push(value.slice(2));
      continue;
    }

    if (value.startsWith(".")) {
      domain_suffix.push(value.slice(1));
      continue;
    }

    // 包含 * 通配符
    if (value.includes("*")) {
      const labels = value.split(".");

      // 将每个 * 转换成一个域名 Label
      // * → [^.]+
      //
      // 例如：
      // *.baidu.com
      // → ^[^.]+\.baidu\.com$
      //
      // *.*.baidu.com
      // → ^[^.]+\.[^.]+\.baidu\.com$
      const regex = labels
        .map(label => {
          if (label === "*") {
            return "[^.]+";
          }

          // 对普通域名 Label 做正则转义
          return escapeRegex(label);
        })
        .join("\\.");

      domain_regex.push(`^${regex}$`);
      continue;
    }

    // 普通域名
    domain.push(value);
  }

  const rule = {};

  if (domain.length > 0) {
    rule.domain = domain;
  }

  if (domain_suffix.length > 0) {
    rule.domain_suffix = domain_suffix;
  }

  if (domain_regex.length > 0) {
    rule.domain_regex = domain_regex;
  }

  return {
    version: 3,
    rules: [rule]
  };
}


// 正则特殊字符转义
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}


async function downloadMemory(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000)
  });

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body 为空');
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}


async function converter(url, inPath, outPath, download = true) {
  let content = "";
  if (download) {
    content = await downloadMemory(url);
    await fs.mkdir(path.dirname(inPath), { recursive: true });
    await fs.writeFile(inPath, content, 'utf8')
  }
  else {
    content = await fs.readFile(inPath, 'utf8');
  }

  const ruleYaml = load(content.toString());
  if (!Array.isArray(ruleYaml?.payload) || ruleYaml.payload.length === 0) {
    throw new Error(`规则 payload 为空或格式错误: ${url}`);
  }

  const singboxRule = convertClashPayload(ruleYaml.payload);
  if (Object.keys(singboxRule.rules[0]).length === 0) {
    throw new Error(`转换后没有有效规则: ${url}`);
  }
  await fs.writeFile(outPath, JSON.stringify(singboxRule, null, 2), 'utf8')
}

function isValidCidr(cidr, ipVersion) {
  const match = cidr.match(/^(.+)\/(\d{1,3})$/);
  if (!match) return false;

  const maxPrefixLength = ipVersion === 4 ? 32 : 128;
  return isIP(match[1]) === ipVersion && Number(match[2]) <= maxPrefixLength;
}

function parseIpList(content, ipVersion) {
  const addresses = content.toString()
    .split(/\r?\n/)
    .map(line => line.split('#', 1)[0].trim())
    .filter(line => line.length > 0);

  if (addresses.length === 0) {
    throw new Error(`IPv${ipVersion} 地址列表为空`);
  }

  for (const address of addresses) {
    if (!isValidCidr(address, ipVersion)) {
      throw new Error(`IPv${ipVersion} CIDR 格式错误: ${address}`);
    }
  }

  return addresses;
}

function formatMainlandSet(addresses, ipVersion) {
  return `set mainland_ipv${ipVersion} {
    type ipv${ipVersion}_addr
    flags interval
    auto-merge
    elements = {
        ${addresses.join(',\n        ')}
    }
}`;
}

async function generateMainlandSets(outputPath) {
  const ipv4Content = await downloadMemory(chinaIpv4Url);
  const ipv6Content = await downloadMemory(chinaIpv6Url);
  const ipv4Addresses = parseIpList(ipv4Content, 4);
  const ipv6Addresses = parseIpList(ipv6Content, 6);
  const content = `${formatMainlandSet(ipv4Addresses, 4)}\n\n${formatMainlandSet(ipv6Addresses, 6)}\n`;

  await fs.writeFile(outputPath, content, 'utf8');
}

const directUrl = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/direct.txt"
const proxyUrl = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/proxy.txt"
const chinaIpv4Url = "https://raw.githubusercontent.com/immortalwrt/homeproxy/master/root/etc/homeproxy/resources/china_ip4.txt"
const chinaIpv6Url = "https://raw.githubusercontent.com/immortalwrt/homeproxy/master/root/etc/homeproxy/resources/china_ip6.txt"

async function main() {
  const directYaml = path.join(import.meta.dirname, "clash/direct.yaml")
  const directJson = path.join(import.meta.dirname, 'direct-site.json');
  await converter(directUrl, directYaml, directJson, true);
  const proxyYaml = path.join(import.meta.dirname, "clash/proxy.yaml")
  const proxyJson = path.join(import.meta.dirname, 'proxy-site.json');
  await converter(proxyUrl, proxyYaml, proxyJson, true);
  const mainlandSets = path.join(import.meta.dirname, 'mainland-ip-sets.nft');
  await generateMainlandSets(mainlandSets);
}


main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
