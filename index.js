import fs from 'node:fs/promises'
import path from 'node:path'
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

const directUrl = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/direct.txt"
const proxyUrl = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/proxy.txt"

async function main() {
  const directYaml = path.join(import.meta.dirname, "clash/direct.yaml")
  const directJson = path.join(import.meta.dirname, 'direct-site.json');
  await converter(directUrl, directYaml, directJson, true);
  const proxyYaml = path.join(import.meta.dirname, "clash/proxy.yaml")
  const proxyJson = path.join(import.meta.dirname, 'proxy-site.json');
  await converter(proxyUrl, proxyYaml, proxyJson, true);
}


main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
