# 晨光词径文档索引

更新日期：2026-07-03
当前版本：v0.9

## 当前有效文档

- [产品规格 v0.9](english-learning-system-spec-v0.9.md)：已上线能力、近 90 天日期查询、本地数据、部署与剩余边界。
- [实施计划 v0.9](implementation-plan-v0.9.md)：近 90 天记录查询的文件范围、测试与验收证据。
- [GitHub Pages 部署设计](github-pages-deployment.md)：静态托管、自动发布和数据边界。
- [词库导入与本地存储设计](vocabulary-import-design.md)：自定义词库导入的可行性、数据模型、交互和验收标准。
- [词库导入格式 v1](vocabulary-import-format-v1.md)：CSV、JSON、XLSX 的字段、限制、重复规则和模板。
- [原生 iOS 开发评估（暂缓）](ios-development-assessment.md)：历史路线评估；v0.9 仍仅使用 iPhone Safari 访问网页。
- [本地开发与部署](local-deployment.md)：当前本机项目的运行、构建、数据和语音依赖。
- [设计与质量验收](../design-qa.md)：响应式、交互、自动化测试和待验项目。

## 历史文档

`english-learning-system-spec-v0.1.md` 至 `v0.8.md`、`implementation-plan-v0.1.md` 至 `v0.8.md` 是历史快照，只用于追溯需求和实施过程，不再代表当前完整行为。

## 文档维护规则

1. 已实现行为写入当前规格；未来设计写入专项设计和实施计划，避免把规划写成已上线功能。
2. 每次功能版本升级，新建一个不可变规格快照，并更新本索引。
3. 词库数量、测试数量、存储键和外部服务策略必须以代码和最新验证结果为准。
4. 历史版本不回写新能力，只增加“历史版本”提示。
