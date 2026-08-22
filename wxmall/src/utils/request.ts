/**
 * 统一请求封装（HTTP 后端用）
 * 把 uni.request 包成 Promise，统一处理 baseUrl、token、错误、返回体解包。
 * cloud 数据源用 uniCloud，不走这里；本文件服务于 backend='http' 的场景。
 */
import { config } from '@/config'
import type { ApiResult } from '@/types'

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'

function getToken(): string {
  return uni.getStorageSync(config.storageKeys.token) || ''
}

function core<T>(url: string, method: Method, data?: Record<string, any>): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      url: config.baseUrl + url,
      method,
      data,
      timeout: config.timeout,
      header: {
        'Content-Type': 'application/json',
        Authorization: getToken() ? `Bearer ${getToken()}` : ''
      },
      success: (res) => {
        const body = res.data as ApiResult<T>
        if (res.statusCode === 200 && body && body.code === 0) {
          resolve(body.data)
        } else if (body && body.code === 401) {
          uni.showToast({ title: '登录已过期', icon: 'none' })
          reject(body)
        } else {
          uni.showToast({ title: (body && body.message) || '请求失败', icon: 'none' })
          reject(body || res)
        }
      },
      fail: (err) => {
        uni.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

export const request = {
  get: <T>(url: string, params?: Record<string, any>) => core<T>(url, 'GET', params),
  post: <T>(url: string, data?: Record<string, any>) => core<T>(url, 'POST', data),
  put: <T>(url: string, data?: Record<string, any>) => core<T>(url, 'PUT', data),
  del: <T>(url: string, data?: Record<string, any>) => core<T>(url, 'DELETE', data)
}
