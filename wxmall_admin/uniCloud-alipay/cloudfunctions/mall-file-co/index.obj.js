// 商城图片文件管理云对象
// 作用：删除 uniCloud 云存储文件。客户端无法直接调用 uniCloud.deleteFile（安全限制），
// 只能在云函数/云对象中执行，故由本云对象代理删除。
// 鉴权：云对象是公开网络接口，必须独立校验——仅登录且具备 admin 角色者可删除。
const uniID = require('uni-id-common')

module.exports = {
  _before() {
    // 每次调用前创建 uni-id 实例
    this.uniID = uniID.createInstance({ clientInfo: this.getClientInfo() })
  },

  /**
   * 删除云存储文件（需 admin 权限）
   * @param {Array} fileList 文件 ID（即上传返回的 url/fileID）数组
   * @returns {Object} 删除结果
   */
  async deleteImages(fileList) {
    console.log('[mall-file-co] 收到删除请求 fileList =', JSON.stringify(fileList))
    // 1. 校验登录态与 admin 角色
    const token = this.getUniIdToken()
    if (!token) {
      throw new Error('未登录，禁止操作')
    }
    const payload = await this.uniID.checkToken(token)
    if (payload.errCode) {
      throw new Error('登录已失效，请重新登录')
    }
    if (!payload.role || payload.role.indexOf('admin') === -1) {
      throw new Error('无权限：仅管理员可删除文件')
    }

    // 2. 参数校验
    if (!Array.isArray(fileList) || !fileList.length) {
      return { errCode: 0, deleted: 0 }
    }
    const list = fileList.filter((f) => !!f)
    if (!list.length) {
      return { errCode: 0, deleted: 0 }
    }

    // 3. 删除云存储文件
    const res = await uniCloud.deleteFile({ fileList: list })
    console.log('[mall-file-co] deleteFile 结果 =', JSON.stringify(res))
    return { errCode: 0, result: res }
  }
}
