// 表单校验规则由 schema2code 生成，不建议直接修改校验规则，而建议通过 schema2code 生成, 详情: https://uniapp.dcloud.net.cn/uniCloud/schema


const validator = {
  "id": {
    "rules": [
      {
        "required": true
      },
      {
        "format": "int"
      }
    ],
    "label": "商品ID",
    "title": "商品ID"
  },
  "title": {
    "rules": [
      {
        "required": true
      },
      {
        "format": "string"
      }
    ],
    "label": "商品标题",
    "title": "商品标题"
  },
  "subtitle": {
    "rules": [
      {
        "format": "string"
      }
    ],
    "label": "副标题",
    "title": "副标题"
  },
  "categoryId": {
    "rules": [
      {
        "required": true
      },
      {
        "format": "int"
      }
    ],
    "label": "所属分类",
    "title": "所属分类"
  },
  "cover": {
    "rules": [
      {
        "format": "string"
      }
    ],
    "label": "封面",
    "title": "封面"
  },
  "images": {
    "rules": [
      {
        "format": "array"
      }
    ],
    "label": "轮播图",
    "title": "轮播图"
  },
  "price": {
    "rules": [
      {
        "required": true
      },
      {
        "format": "double"
      },
      {
        "minimum": 0
      }
    ],
    "label": "售价(元)",
    "title": "售价"
  },
  "oldPrice": {
    "rules": [
      {
        "format": "double"
      },
      {
        "minimum": 0
      }
    ],
    "label": "原价(元)",
    "title": "原价"
  },
  "sold": {
    "rules": [
      {
        "format": "int"
      }
    ],
    "label": "销量",
    "title": "销量",
    "defaultValue": 0
  },
  "stock": {
    "rules": [
      {
        "format": "int"
      }
    ],
    "label": "库存",
    "title": "库存",
    "defaultValue": 0
  },
  "rating": {
    "rules": [
      {
        "format": "int"
      }
    ],
    "label": "评分(1-5)",
    "title": "评分"
  },
  "tags": {
    "rules": [
      {
        "format": "array"
      }
    ],
    "label": "标签",
    "title": "标签"
  },
  "desc": {
    "rules": [
      {
        "format": "string"
      }
    ],
    "label": "商品描述",
    "title": "商品描述"
  },
  "detailImages": {
    "rules": [
      {
        "format": "array"
      }
    ],
    "label": "详情图",
    "title": "详情图"
  },
  "skus": {
    "rules": [
      {
        "format": "array"
      }
    ],
    "label": "规格",
    "title": "规格(SKU)"
  },
  "onSale": {
    "rules": [
      {
        "format": "bool"
      }
    ],
    "label": "上架状态",
    "title": "是否上架",
    "defaultValue": true
  }
}

const enumConverter = {}

function filterToWhere(filter, command) {
  let where = {}
  for (let field in filter) {
    let { type, value } = filter[field]
    switch (type) {
      case "search":
        if (typeof value === 'string' && value.length) {
          where[field] = new RegExp(value)
        }
        break;
      case "select":
        if (value.length) {
          let selectValue = []
          for (let s of value) {
            selectValue.push(command.eq(s))
          }
          where[field] = command.or(selectValue)
        }
        break;
      case "range":
        if (value.length) {
          let gt = value[0]
          let lt = value[1]
          where[field] = command.and([command.gte(gt), command.lte(lt)])
        }
        break;
      case "date":
        if (value.length) {
          let [s, e] = value
          let startDate = new Date(s)
          let endDate = new Date(e)
          where[field] = command.and([command.gte(startDate), command.lte(endDate)])
        }
        break;
      case "timestamp":
        if (value.length) {
          let [startDate, endDate] = value
          where[field] = command.and([command.gte(startDate), command.lte(endDate)])
        }
        break;
    }
  }
  return where
}

export { validator, enumConverter, filterToWhere }
