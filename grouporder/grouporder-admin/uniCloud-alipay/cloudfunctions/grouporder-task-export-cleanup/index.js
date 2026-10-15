/**
 * grouporder-task-export-cleanup · 定时：清单 60 天清理
 * 触发：定时（每日）
 * 规格：D-071②、CLOUD_API §12
 *
 * 清单是可从订单随时重新生成的过程产物，【不纳入 D-035 的订单三年留存】——
 * 多保存一份含姓名、电话、完整地址的文件只会扩大泄露面。
 * 失效版本仅作标记，随 60 天保留期一并清除，以便争议追查。
 *
 * 已清理的生成事件写 file_cleaned = 1，查询条件排除它们，不会被反复选中；
 * 单次执行在时间预算内循环处理多批，直到没有待清理记录。
 */
const { exportlog } = require('grouporder-common')

const BATCH_SIZE = 200
// 单次执行的时间预算：package.json 中 timeout = 60 秒，留出余量写日志并返回
const TIME_BUDGET_MS = 50 * 1000
// 单次执行中删除失败的记录上限：超过即停止，留待次日重试
const MAX_FAILED = 200
// 云存储里文件已不存在：视同清理完成（重复删除、手工删除过的历史记录）
const NOT_EXIST_RE = /not.?exist|nonexist|not.?found/i

exports.main = async () => {
  const db = uniCloud.database()
  const dbCmd = db.command
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const cutoff = now - exportlog.FILE_RETENTION_DAYS * dayMs

  const result = { scanned: 0, deleted_files: 0, marked: 0, failed: 0, batches: 0, errors: [] }
  // 本次执行中删除失败的记录不标记、排除出后续批次，次日再试
  const failedIds = []
  let hasMore = true

  while (hasMore && Date.now() - now < TIME_BUDGET_MS && failedIds.length < MAX_FAILED) {
    const where = {
      event_type: exportlog.EVENT.GENERATE_OK,
      create_date: dbCmd.lte(cutoff),
      // 旧记录没有该字段，用 neq 一并选中
      file_cleaned: dbCmd.neq(1)
    }
    if (failedIds.length) where._id = dbCmd.nin(failedIds)
    const { data } = await db.collection('grouporder-export-log')
      .where(where)
      .field({ _id: true, file_version: true })
      .orderBy('create_date', 'asc')
      .limit(BATCH_SIZE)
      .get()
    const rows = data || []
    hasMore = rows.length === BATCH_SIZE
    if (!rows.length) break
    result.batches++
    result.scanned += rows.length

    // 只有 fileID 形态的版本标识才能删；自定义批次号没有文件可删，直接标记已清理，不误删云存储
    const isFile = v => typeof v === 'string' && v.startsWith('cloud://')
    const fileIds = [...new Set(rows.map(d => d.file_version).filter(isFile))]
    const okFiles = new Set()
    if (fileIds.length) {
      try {
        // 清单文件由本项目独占生成，不存在被商品或活动图片引用的情况，
        // 因此可以安全删除（与 GOODS_LIB_SPEC §6 的图片文件不同）
        const res = await uniCloud.deleteFile({ fileList: fileIds })
        for (const f of (res.fileList || [])) {
          if (f.code === 'SUCCESS') {
            okFiles.add(f.fileID)
            result.deleted_files++
          } else if (NOT_EXIST_RE.test(`${f.code || ''} ${f.message || ''}`)) {
            okFiles.add(f.fileID)
          }
        }
      } catch (e) {
        if (result.errors.length < 20) result.errors.push({ stage: 'deleteFile', message: e.message })
        console.error('[export-cleanup] 删除云存储文件失败：', e)
      }
    }

    const doneIds = []
    for (const d of rows) {
      if (!isFile(d.file_version) || okFiles.has(d.file_version)) doneIds.push(d._id)
      else { failedIds.push(d._id); result.failed++ }
    }
    if (doneIds.length) {
      try {
        // 只写清理标记，事件内容本身【不删除、不修改】——Excel 事件仍须可审计追溯（OPS §10）
        const res = await db.collection('grouporder-export-log')
          .where({ _id: dbCmd.in(doneIds) })
          .update({ file_cleaned: 1, file_clean_date: now })
        result.marked += res.updated || 0
      } catch (e) {
        // 标记失败：排除出本次后续批次防止死循环，次日重删是幂等的
        failedIds.push(...doneIds)
        result.failed += doneIds.length
        if (result.errors.length < 20) result.errors.push({ stage: 'mark', message: e.message })
        console.error('[export-cleanup] 写清理标记失败：', e)
      }
    }
  }

  // 文件删除后下载会失败，listDownload 与 exportDownload 会各自写一条
  // DOWNLOAD_FAIL，这正是期望的可追踪行为。
  // 预算用尽或失败过多而提前停止时为 true，剩余部分由次日继续
  result.has_more = hasMore
  console.log('[export-cleanup]', JSON.stringify(result))
  return result
}
