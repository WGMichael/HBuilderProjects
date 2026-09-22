#!/usr/bin/env node
/**
 * 从云对象源码生成前端调用清单。
 *
 * 为什么要生成而不是手写：93 个方法名手抄一定会漂。本脚本直接读
 * grouporder-admin/uniCloud-alipay/cloudfunctions/ 下各 index.obj.js 的公开方法，
 * 方法名永远与实现一致。
 *
 * 【只生成 index.js（方法名与转发）。参数与出参不在这里定义，
 *   以 docs/arch/CLOUD_API.md §14 为唯一事实源，避免出现第二份签名。】
 *
 * 用法：node tools/gen-frontend-api.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const CF_DIR = path.join(ROOT, 'grouporder-admin/uniCloud-alipay/cloudfunctions')

// 云对象 → 前端命名空间。
// goodsLib 刻意不叫 goods：活动内商品的方法（goodsCreate 等）在 activity-co 里，
// 两者同名会让人调错对象。
const NAMESPACES = [
  ['grouporder-activity-co', 'activity', '活动与活动内商品'],
  ['grouporder-order-co', 'order', '订单'],
  ['grouporder-goods-co', 'goodsLib', '商品库与分类（账号级）'],
  ['grouporder-user-co', 'user', '收货信息簿、绑定申诉、隐私请求、待办'],
  ['grouporder-export-co', 'exportList', '清单预览、生成与下载'],
  ['grouporder-report-co', 'report', '举报'],
  ['grouporder-ops-co', 'ops', '运营后台（仅 admin 工程使用）']
]

/** 取云对象的公开方法名：跳过 _before / _after 与所有 _ 开头的私有方法 */
function publicMethods (objName) {
  const file = path.join(CF_DIR, objName, 'index.obj.js')
  const src = fs.readFileSync(file, 'utf8')
  const names = []
  for (const m of src.matchAll(/^ {2}(?:async )?([A-Za-z][A-Za-z0-9_]*) \(/gm)) {
    names.push(m[1])
  }
  return names
}

function build () {
  const lines = []
  lines.push('/**')
  lines.push(' * 群接龙云对象调用清单')
  lines.push(' *')
  lines.push(' * 【本文件由 tools/gen-frontend-api.js 自动生成，不要手改】')
  lines.push(' * 新增或改名云对象方法后重跑：node tools/gen-frontend-api.js')
  lines.push(' *')
  lines.push(' * 这里只有方法名与转发。**入参、出参、幂等键一律查 docs/arch/CLOUD_API.md §14**，')
  lines.push(' * 本文件刻意不重复定义参数，避免签名出现第二个事实源。')
  lines.push(' *')
  lines.push(' * 用法：')
  lines.push(' *   import api from \'@/api\'')
  lines.push(' *   const { activity_id } = await api.activity.activityCreateDraft({ ... })')
  lines.push(' *   // 成功直接拿 data；失败抛 BizError，由 client.js 统一处理')
  lines.push(' */')
  lines.push("import { call } from './client'")
  lines.push('')

  let total = 0
  const nsNames = []
  for (const [objName, ns, desc] of NAMESPACES) {
    const methods = publicMethods(objName)
    total += methods.length
    nsNames.push(ns)
    lines.push(`/** ${desc}（${objName}，${methods.length} 个方法） */`)
    lines.push(`export const ${ns} = {`)
    for (const m of methods) {
      lines.push(`  ${m}: (params, options) => call('${objName}', '${m}', params, options),`)
    }
    lines.push('}')
    lines.push('')
  }

  lines.push(`/** 合计 ${total} 个方法 */`)
  lines.push(`export default { ${nsNames.join(', ')} }`)
  lines.push('')
  return { content: lines.join('\n'), total }
}

const { content, total } = build()
const targets = [
  path.join(ROOT, 'grouporder-client/src/api/index.js'),
  path.join(ROOT, 'grouporder-admin/js_sdk/grouporder-api/index.js')
]
for (const t of targets) {
  fs.mkdirSync(path.dirname(t), { recursive: true })
  fs.writeFileSync(t, content)
  console.log('  写入', path.relative(ROOT, t))
}
console.log(`  共 ${total} 个方法`)
