/**
 * 图片文件字段的写库与回收（D-084）
 *
 * 放在 common：活动、活动商品（activity-co）与商品库（goods-co）都要用，云对象之间不互相调用。
 */

/** 从 file 字段（单个或数组）里取出 fileID 列表，兼容旧数据直接存字符串 */
function fileIdsOf (...fields) {
  const ids = []
  for (const f of fields) {
    for (const it of (Array.isArray(f) ? f : [f])) {
      const id = (it && it.fileID) || (typeof it === 'string' ? it : '')
      if (id) ids.push(id)
    }
  }
  return ids
}

/**
 * 生成写库用的 patch：单个 file 字段（cover_image）改用 dbCmd.set 整体替换。
 * update() 对对象值默认按子字段合并（cover_image.fileID …），原值为 null 时数据库会报
 * 「Cannot create field 'extname' in element {cover_image: null}」；整体替换也避免残留旧子字段。
 * 返回新对象，原 patch 保持原始值，供图片回收、送检与重审判定使用
 */
function toDbPatch (ctx, patch) {
  const out = Object.assign({}, patch)
  if (out.cover_image) out.cover_image = ctx.db.command.set(out.cover_image)
  return out
}

/**
 * 回收被替换掉的云存储文件
 *
 * 同一 fileID 可能同时被活动、活动商品、商品库引用（复用历史接龙 / 商品库复制的都是引用，
 * GOODS_LIB_SPEC §6），所以只删各表里都已无人引用的文件；软删的库记录也算引用。
 * 举报快照与内容检测快照里的图片是治理证据（OPS §5.1、§5.2），同样算引用——
 * 团长换图不能把举报 / 送检时的证据图删掉。
 * 必须在新值写库成功之后调用。回收是附属动作，失败只记日志，不影响主操作。
 *
 * @param {object} ctx     auth.createContext 返回的上下文
 * @param {string[]} prevIds 修改前的 fileID
 * @param {string[]} nextIds 修改后的 fileID
 */
async function releaseFiles (ctx, prevIds, nextIds) {
  const keep = new Set(nextIds)
  const candidates = [...new Set(prevIds)].filter(id => !keep.has(id))
  if (!candidates.length) return
  try {
    const cmd = ctx.db.command
    // [集合, 图片字段路径...]：字段值可能是 file 对象 / file 对象数组 / fileID 字符串（数组），
    // 每个路径同时按 `路径.fileID` 与 `路径` 本身匹配；数组字段按元素匹配
    const refs = [
      ['grouporder-activity', 'cover_image', 'images'],
      ['grouporder-goods', 'cover_image', 'detail_images'],
      ['grouporder-goods-lib', 'cover_image', 'detail_images'],
      // 举报时的内容快照（report-co reportSubmit 写入）
      ['grouporder-report', 'content_snapshot.activity_cover', 'content_snapshot.activity_images',
        'content_snapshot.goods_cover', 'content_snapshot.goods_detail_images'],
      // 图片送检快照 { files: [fileID] }（contentcheck.submitImages 写入）
      ['grouporder-content-check', 'content_snapshot.files']
    ]
    // 每个文件在各表里的引用并发查询，文件之间也并发：删草稿、换多图时不再逐条串行等待
    // 折中：快照字段无索引，举报 / 检测表按这些路径查询是全表扫描；回收只在换图、删草稿时触发，量可接受
    const isUsed = async (id) => {
      const counts = await Promise.all(refs.map(([coll, ...paths]) =>
        ctx.db.collection(coll).where(cmd.or(
          paths.reduce((arr, f) => arr.concat([{ [`${f}.fileID`]: id }, { [f]: id }]), [])
        )).count()
      ))
      return counts.some(r => (r.total || 0) > 0)
    }
    const used = await Promise.all(candidates.map(isUsed))
    const orphans = candidates.filter((id, i) => !used[i])
    if (orphans.length) await uniCloud.deleteFile({ fileList: orphans })
  } catch (e) {
    console.error('[files] 回收云存储文件失败，主操作不受影响：', e)
  }
}

module.exports = { fileIdsOf, toDbPatch, releaseFiles }
