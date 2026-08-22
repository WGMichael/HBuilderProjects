/**
 * 图片相关工具
 */

/**
 * 判断字段是否为图片地址。
 * 真实数据下发 https 地址；mock/骨架阶段可能是 emoji 或空值。
 * 用于模板里「是图片就用 <image>，否则回退到 emoji/文字」的双路渲染。
 */
export function isImg(v?: string): boolean {
  return !!v && (/^https?:\/\//.test(v) || v.startsWith('/') || v.startsWith('cloud://'))
}
