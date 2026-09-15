import fs from 'node:fs/promises'
import { pipeline } from 'node:stream/promises';
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


// ===== 测试 =====

const payload = [
  "+.000webhost.com",
  "+.0rz.tw",
  ".baidu.com",
  "baidu.com",
  "*.microsoft.com",
  "*.*.microsoft.com",
  "*.*.*.example.com"
];

console.log(
  JSON.stringify(convertClashPayload(payload), null, 2)
);

async function downloadFile(url, outputPath) {
  const response = await fetch(url, {
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  if (!response.body) {
    throw new Error('Response body 为空');
  }

  await pipeline(
    response.body,
    fs.createWriteStream(outputPath)
  );
}

async function downloadMemory(url) {
  const response = await fetch(url, {
    redirect: 'follow'
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
  try {
    let content = "";
    if (download) {
      content = await downloadMemory(url);
      await fs.writeFile(inPath, content, 'utf8')
    }
    else {
      content = await fs.readFile(inPath, 'utf8');
    }
    
    const ruleYaml = load(content);
    const singboxRule = convertClashPayload(ruleYaml.payload);
    await fs.writeFile(outPath, JSON.stringify(singboxRule, null, 2), 'utf8')
  } catch (error) {
     console.log(error)
  }
}

const directUrl = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/direct.txt"
const proxyUrl = "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/proxy.txt"

function main() {
  const directYaml = path.join(import.meta.dirname, "clash/direct.yaml")
  const dierctJson = path.join(import.meta.dirname, 'sing-box/direct-site.json');
  converter(directUrl, directYaml, dierctJson, false);
  const proxyYaml = path.join(import.meta.dirname, "clash/proxy.yaml")
  const proxyJson = path.join(import.meta.dirname, 'sing-box/proxy-site.json');
  converter(proxyUrl, proxyYaml, proxyJson, true);
}


main();