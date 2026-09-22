/**
 * grouporder-task-export-cleanup · 定时：清单 60 天清理
 * 触发：定时（每日）
 * 规格：D-071②、CLOUD_API §12
 *
 * 清单是可从订单随时重新生成的过程产物，【不纳入 D-035 的订单三年留存】——
 * 多保存一份含姓名、电话、完整地址的文件只会扩大泄露面。
 * 失效版本仅作标记，随 60 天保留期一并清除，以便争议追查。
 */
const { exportlog } = require('grouporder-common')

const BATCH_SIZE = 200
// 每日任务只处理「刚跨过 60 天」的一段，而不是全部历史记录。
// 窗口取 7 天是为了容忍任务连续失败几天；重复 deleteFile 是幂等的，
// 代价只是少量无效调用，换来的是不必在 schema 未定义的字段上加清理标记。
const SCAN_WINDOW_DAYS = 7

exports.main = async () => {
  const db = uniCloud.database()
  const dbCmd = db.command
  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const cutoff = now - exportlog.FILE_RETENTION_DAYS * dayMs
  const windowStart = cutoff - SCAN_WINDOW_DAYS * dayMs

  const result = { scanned: 0, deleted_files: 0, failed: 0, errors: [] }

  const { data } = await db.collection('grouporder-export-log')
    .where({
      event_type: exportlog.EVENT.GENERATE_OK,
      create_date: dbCmd.gte(windowStart).and(dbCmd.lte(cutoff))
    })
    .field({ _id: true, file_version: true, activity_id: true })
    .orderBy('create_date', 'asc')
    .limit(BATCH_SIZE)
    .get()

  result.scanned = (data || []).length

  // 只有 fileID 形态的版本标识才能删；自定义批次号一律跳过，不误删云存储
  const fileIds = (data || [])
    .map(d => d.file_version)
    .filter(v => typeof v === 'string' && v.startsWith('cloud://'))

  if (fileIds.length) {
    try {
      // 清单文件由本项目独占生成，不存在被商品或活动图片引用的情况，
      // 因此可以安全删除（与 GOODS_LIB_SPEC §6 的图片文件不同）
      const res = await uniCloud.deleteFile({ fileList: fileIds })
      result.deleted_files = (res.fileList || []).filter(f => f.code === 'SUCCESS').length
    } catch (e) {
      result.failed++
      result.errors.push({ stage: 'deleteFile', message: e.message })
      console.error('[export-cleanup] 删除云存储文件失败：', e)
    }
  }

  // 事件记录本身【不删除、不修改】——Excel 事件仍须可审计追溯（OPS §10）。
  // 文件删除后下载会失败，listDownload 与 exportDownload 会各自写一条
  // DOWNLOAD_FAIL，这正是期望的可追踪行为。
  result.has_more = result.scanned === BATCH_SIZE
  console.log('[export-cleanup]', JSON.stringify(result))
  return result
}
