/**
 * 数据层出口
 * 页面统一从这里 import { db } 使用数据，永远不直接碰 mock / api。
 *
 * 切换数据来源：只改 config.USE_MOCK
 *   true  -> MockDataSource（本地假数据）
 *   false -> CloudDataSource（真实后台：uniCloud 或 HTTP）
 */
import { config } from '@/config'
import type { IDataSource } from './datasource'
import { MockDataSource } from './mock-datasource'
import { CloudDataSource } from './cloud-datasource'

export const db: IDataSource = config.USE_MOCK
  ? new MockDataSource()
  : new CloudDataSource()

export type { IDataSource } from './datasource'
