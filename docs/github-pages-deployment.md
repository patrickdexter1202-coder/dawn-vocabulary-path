# GitHub Pages 在线部署设计

更新日期：2026-07-02  
状态：已上线并完成首次验收

## 正式环境

- 生产网址：`https://patrickdexter1202-coder.github.io/dawn-vocabulary-path/`
- GitHub 仓库：`https://github.com/patrickdexter1202-coder/dawn-vocabulary-path`（Public）
- 发布分支：`main`
- 自动发布：`.github/workflows/deploy-pages.yml`
- 首次成功运行：`Deploy GitHub Pages #1` 的第 2 次尝试；测试 33 项、构建与部署均成功

线上验收已检查首页、字体、JS、CSS、开始学习、默写提交和浏览器重开后的 `localStorage` 持久化；浏览器控制台无资源加载错误。真实 iPhone Safari、外部有道音频失败回退和长期 IndexedDB 持久性仍按产品规格作为家庭设备验收项。

## 部署模型

GitHub 仓库保存源码，GitHub Actions 运行测试与 Vite 构建，GitHub Pages 只托管生成后的静态文件。浏览器直接访问 HTTPS 页面，没有应用服务器和云数据库。

## 数据边界

- GitHub：源码、内置词库和构建产物；
- `localStorage`：当前浏览器的学习记录；
- IndexedDB：已实现的当前浏览器自定义词库；
- JSON 文件：由家长主动导出的完整备份；
- 有道：点击播放时请求单词音频，不接收学习记录。

GitHub Pages 地址在所有设备上相同，但浏览器存储不同。相同网址不等于相同数据。

## 构建要求

- Vite `base` 必须匹配仓库名；
- 字体和静态资源不能写死为域名根路径；
- Actions 必须在构建前运行完整测试；
- 发布失败时保留上一成功版本；
- 不把密钥、学习记录或导入词库提交到仓库。

当前实现通过 `VITE_BASE_PATH` 或 GitHub Actions 的 `GITHUB_REPOSITORY` 自动生成 Vite 项目子路径；`app/scripts/assert-pages-build.mjs` 会在发布前检查入口资源和字体路径。

自动发布工作流：`.github/workflows/deploy-pages.yml`。主分支 `main` 更新或手动触发时，依次执行锁定依赖安装、完整测试、Pages 构建断言、artifact 上传和 GitHub 官方 Pages 发布。

## 可见性与网络

GitHub Pages 发布网站是公开网页，不提供家庭密码访问控制。当前页面不包含服务器端个人数据，因此公开的是程序和内置内容，不是家庭学习记录。

在中国大陆访问 GitHub Pages 和外部有道音频可能受网络环境影响。上线后必须用家庭实际宽带和手机网络实测；浏览器本地学习数据不受短时断网影响，但首次打开或刷新页面需要获取站点文件。

## 验收清单

- 首页和所有静态资源返回成功；
- 刷新页面不会出现空白或 404；
- 桌面与 iPhone 都能完成一轮学习；
- 清除网络后，已经打开的页面不会丢失本地记录；
- 仓库和构建日志中不存在家庭数据；
- 文档记录正式 URL、部署分支、Actions 名称和回滚步骤。

## 回滚

对 `main` 上的问题提交执行普通 `git revert` 后推送，Actions 会自动重新发布；也可以在 GitHub Actions 的成功运行页面重新运行全部任务。GitHub Pages 在新部署失败时保留上一成功版本。
