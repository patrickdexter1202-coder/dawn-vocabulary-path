# 晨光词径词库导入格式 v1

更新日期：2026-07-02  
适用版本：v0.8 及当前线上版本

## 1. 支持的文件

| 格式 | 要求 |
| --- | --- |
| CSV | UTF-8 编码、英文逗号分隔、首行为表头；支持双引号包裹逗号和换行 |
| JSON | 顶层为词条数组，或 `{ "entries": [...] }` |
| XLSX | 首行为表头；支持多 Sheet 选择；只读取单元格显示文本，不执行公式或宏 |

不支持旧版二进制 `.xls`、带密码的工作簿、宏执行和 HTML 表格。单文件最大 10 MB；任一 Sheet 最多 20,000 行。

## 2. 字段标准

| 字段 | 必填 | 说明 | 当前可识别表头 |
| --- | --- | --- | --- |
| `word` | 是 | 学习页显示的英文；去除首尾空格后不能为空，最长 160 字符 | `word`、`单词`、`英文`、`english` |
| `meaning` | 是 | 默写时显示的中文释义；最长 600 字符 | `meaning`、`释义`、`中文`、`中文释义`、`chinese` |
| `answer` | 否 | 判分答案；为空时等于 `word` | `answer`、`答案` |
| `phonetic` | 否 | 音标显示文本 | `phonetic`、`音标` |
| `example` | 否 | 例句；为空时显示“自定义词库未提供例句” | `example`、`例句`、`sentence` |
| `unit` | 否 | 单元或分组标签 | `unit`、`单元` |
| `source` | 否 | 来源说明 | `source`、`来源` |
| `tags` | 否 | 标签；多个值用英文或中文逗号分隔 | `tags`、`标签` |

导入页可以手动映射 `word`、`meaning`、`phonetic`、`example` 四项。`answer`、`unit`、`source`、`tags` 应使用上表中的标准名或别名。

`grade`、`book`、`notes`、`sourceUrl`、`license` 尚未写入当前 IndexedDB 词条，不能把它们当作已保存字段；来源和授权信息现阶段请合并写入 `source`。

## 3. 重复与校验

- 完全重复键为：小写、合并空格后的 `word` + 原始 `meaning`；
- “跳过”保留第一次出现的词条；
- “覆盖”用后出现的内容覆盖同次导入中的前项，并保持该项稳定 ID；
- 相同英文、不同释义可以同时保留；
- 无效行会进入导入报告；若没有任何有效行，则不创建词库；
- 每次导入创建一个新的自定义词库，不会自动修改其他已有词库。

## 4. CSV 模板

项目模板：[vocabulary-import-template.csv](templates/vocabulary-import-template.csv)

```csv
word,meaning,answer,phonetic,example,unit,source,tags
apple,苹果,apple,/ˈæpəl/,I eat an apple.,Unit 1,家庭整理,"水果,基础"
take off,脱下；起飞,take off,,Please take off your coat.,Unit 2,教材摘录,短语
```

## 5. JSON 模板

项目模板：[vocabulary-import-template.json](templates/vocabulary-import-template.json)

```json
{
  "entries": [
    {
      "word": "apple",
      "meaning": "苹果",
      "answer": "apple",
      "phonetic": "/ˈæpəl/",
      "example": "I eat an apple.",
      "unit": "Unit 1",
      "source": "家庭整理",
      "tags": ["水果", "基础"]
    }
  ]
}
```

## 6. 备份 JSON 不是词库模板

“导出完整备份”生成的 JSON 包含 `schemaVersion`、学习记录和全部自定义词库，用于覆盖式恢复。它与普通 JSON 词库导入是两个入口，不应手工改成词库模板。

