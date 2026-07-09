# 晨光词径

面向家庭使用的英语词汇跟读与默写网页。生产环境由 GitHub Pages 提供静态文件；学习记录和自定义词库只保存在当前浏览器，不上传到 GitHub，也不自动跨设备同步。

在线访问：[https://patrickdexter1202-coder.github.io/dawn-vocabulary-path/](https://patrickdexter1202-coder.github.io/dawn-vocabulary-path/)

## 当前能力

- 内置小学基准、六年级上册 Unit 1-6 与衔接混合词库；
- 跟读、中文提示默写、错词巩固，以及默认当天、可查询近 90 天的会话学习记录；
- CSV、JSON、XLSX 自定义词库导入，含工作表选择、字段映射、预览、校验和去重；
- IndexedDB 本地词库、`localStorage` 学习记录；
- 带版本号的完整 JSON 备份与恢复；
- GitHub Actions 自动测试、构建并发布 GitHub Pages；
- 桌面、平板与 iPhone Safari 响应式布局。

线上版本自带三套只读词库：默认“衔接混合”774 条、“小学基准”498 条、“六年级上 Unit 1-6”277 条，无需导入即可开始学习。

自定义词库必须至少包含 `word` 和 `meaning`。完整字段、限制及 CSV/JSON 模板见 [词库导入格式 v1](docs/vocabulary-import-format-v1.md)。

## 本地开发

```bash
cd app
pnpm install --frozen-lockfile
pnpm test
pnpm dev
```

GitHub Pages 项目站点构建：

```bash
VITE_BASE_PATH=/dawn-vocabulary-path/ pnpm build:pages
```

## 数据边界

同一个网址在不同电脑、手机或浏览器中拥有不同的本地数据。换设备、换浏览器、使用无痕模式或清除网站数据前，请从“陆梵 → 本地词库与备份”导出完整备份。

详细规格与部署说明见 [docs/README.md](docs/README.md)，当前有效规格为 v0.9。
