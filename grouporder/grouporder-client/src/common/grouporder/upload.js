/**
 * 图片「先选后传」工具（活动表单与商品编辑共用）
 *
 * 选图时只记本地临时路径，团长最终确认（保存草稿 / 下一步 / 保存商品）时才上传——
 * 中途撤销的图不会白白传到云端。写法参照 wxmall_admin 商品编辑页。
 *
 * 表单里每张图是一个 item：
 *   { file, localPath, preview }
 *   - 已在云端：file = { fileID, url, name, extname }，localPath 为空
 *   - 待上传：  file = null，localPath 为本地临时路径
 * 上传成功后 item 就地改为「已在云端」，保存失败重试时不会重复上传。
 *
 * 云存储路径：{创建日期}/{活动ID}/{文件名}，同一场活动的图集中在一个目录。
 * 被替换掉的旧图由云对象在保存成功后按引用情况回收，客户端不删文件。
 */

/** 已入库的 file 值 → item */
export function toItem(file) {
  return { file, localPath: '', preview: (file && file.url) || '' };
}

/** 选图，返回待上传的 item 列表 */
export function pickImages(count) {
  return new Promise((resolve) => {
    uni.chooseImage({
      count,
      sizeType: ['compressed'],
      success: (r) => resolve((r.tempFilePaths || []).map((p) => ({ file: null, localPath: p, preview: p }))),
      fail: () => resolve([]),
    });
  });
}

/** 活动图片目录：YYYY-MM-DD/活动ID/ */
export function imageDir(createDate, activityId) {
  const d = new Date(createDate || Date.now());
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${day}/${activityId}/`;
}

async function uploadOne(localPath, cloudPath) {
  let fileID = '';
  try {
    const res = await uniCloud.uploadFile({ filePath: localPath, cloudPath, cloudPathAsRealPath: true });
    fileID = (res && res.fileID) || '';
  } catch (e) {
    // 支付宝云常见「上传成功却误 reject」（wxmall 实测），按路径拼出 fileID，下面再验证是否真的存在
    const spaceId = uniCloud.config && uniCloud.config.spaceId;
    if (!spaceId) throw e;
    fileID = `cloud://${spaceId}/${cloudPath}`;
  }
  if (!fileID) throw new Error('图片上传失败');

  let url = fileID;
  if (fileID.indexOf('cloud://') === 0) {
    const t = await uniCloud.getTempFileURL({ fileList: [fileID] });
    const it = t && t.fileList && t.fileList[0];
    if (!(it && it.tempFileURL && (!it.code || it.code === 'SUCCESS'))) throw new Error('图片上传失败');
    url = it.tempFileURL;
  }
  const name = cloudPath.slice(cloudPath.lastIndexOf('/') + 1);
  return { fileID, url, name, extname: name.slice(name.lastIndexOf('.') + 1) };
}

/**
 * 把 items 里待上传的图传到 dir 下，就地更新 item。
 * @param {Array} items  item 列表
 * @param {String} dir   imageDir() 的结果
 * @param {String} prefix 文件名前缀，如 cover / img / goods_cover
 */
export async function uploadPending(items, dir, prefix) {
  const ts = Date.now();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it || !it.localPath) continue;
    const m = /\.(\w+)$/.exec(it.localPath);
    const ext = m ? m[1].toLowerCase() : 'jpg';
    it.file = await uploadOne(it.localPath, `${dir}${prefix}_${ts}_${i}.${ext}`);
    it.localPath = '';
  }
}
