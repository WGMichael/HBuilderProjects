<template>
  <!-- 商品 SKU 规格编辑器：对象数组 [{id,name,price,oldPrice,stock,limitPerOrder}] 的可视化增删改 -->
  <view class="sku-editor">
    <view v-if="rows.length" class="sku-head">
      <text class="col-name">规格名</text>
      <text class="col-num">价格(元)</text>
      <text class="col-num">原价(元)</text>
      <text class="col-num">库存</text>
      <text class="col-num">销量</text>
      <text class="col-num">单次限购</text>
      <text class="col-op"></text>
    </view>
    <view v-for="(row, i) in rows" :key="i" class="sku-row">
      <uni-easyinput class="col-name" v-model="row.name" placeholder="如 500g/礼盒装" />
      <uni-easyinput class="col-num" type="number" v-model="row.price" placeholder="价格" />
      <uni-easyinput class="col-num" type="number" v-model="row.oldPrice" placeholder="原价" />
      <uni-easyinput class="col-num" type="number" v-model="row.stock" placeholder="库存" />
      <uni-easyinput class="col-num" type="number" v-model="row.sold" placeholder="销量" />
      <uni-easyinput class="col-num" type="number" v-model="row.limitPerOrder" placeholder="0=不限" />
      <button class="col-op" type="warn" size="mini" @click="removeRow(i)">删除</button>
    </view>
    <button class="sku-add" size="mini" @click="addRow">+ 添加规格</button>
    <text v-if="!rows.length" class="sku-tip">请至少添加一个规格（写明重量/数量，如 500g / 10颗）</text>
  </view>
</template>

<script>
  // 说明：通过 v-model 与父页面的 formData.skus 双向绑定；元素结构对齐 tc-products.schema 的 skus
  export default {
    name: 'mall-sku-editor',
    props: {
      modelValue: {
        type: Array,
        default() {
          return []
        }
      }
    },
    emits: ['update:modelValue'],
    data() {
      return {
        rows: []
      }
    },
    watch: {
      modelValue: {
        immediate: true,
        handler(val) {
          // 外部值与内部不一致时才同步，避免 emit 回环
          if (JSON.stringify(val || []) !== JSON.stringify(this.toOutput())) {
            this.rows = (val || []).map((s) => ({
              id: s.id,
              name: s.name,
              price: s.price,
              oldPrice: s.oldPrice,
              stock: s.stock,
              sold: s.sold,
              limitPerOrder: this.normalizeLimit(s.limitPerOrder)
            }))
          }
        }
      },
      // 深度监听 rows：单元格输入真正更新后再同步给父（避免 @input 早于 v-model 取到旧值）
      rows: {
        deep: true,
        handler() {
          this.emitChange()
        }
      }
    },
    methods: {
      addRow() {
        this.rows.push({ id: '', name: '', price: null, oldPrice: null, stock: 999, sold: 0, limitPerOrder: 0 })
      },
      removeRow(i) {
        this.rows.splice(i, 1)
      },
      normalizeLimit(value) {
        // 0 = 不限购；缺省/非法也按 0（不限）处理
        const n = Number(value)
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
      },
      // 规范化为存库结构：数字字段转 number，限购缺省按 1，id 缺省用行号
      toOutput() {
        return this.rows.map((r, idx) => ({
          id: r.id || idx + 1,
          name: r.name || '',
          price: r.price === '' || r.price == null ? 0 : Number(r.price),
          oldPrice: r.oldPrice === '' || r.oldPrice == null ? 0 : Number(r.oldPrice),
          stock: r.stock === '' || r.stock == null ? 0 : Number(r.stock),
          sold: r.sold === '' || r.sold == null ? 0 : Number(r.sold),
          limitPerOrder: this.normalizeLimit(r.limitPerOrder)
        }))
      },
      emitChange() {
        this.$emit('update:modelValue', this.toOutput())
      }
    }
  }
</script>

<style>
  .sku-editor {
    width: 100%;
  }

  .sku-head,
  .sku-row {
    /* #ifndef APP-NVUE */
    display: flex;
    /* #endif */
    flex-direction: row;
    align-items: center;
    margin-bottom: 8px;
  }

  .sku-head {
    padding: 0 4px;
    font-size: 12px;
    color: #999;
  }

  .col-name {
    flex: 2;
    margin-right: 8px;
  }

  .col-num {
    flex: 1;
    margin-right: 8px;
  }

  .col-op {
    width: 60px;
  }

  .sku-add {
    margin-top: 4px;
  }

  .sku-tip {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    color: #999;
  }
</style>
