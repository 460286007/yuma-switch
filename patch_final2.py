import io

p = 'src/App.tsx'
s = io.open(p, encoding='utf-8', newline='').read()

def rep(old, new, tag, count=1):
    global s
    assert s.count(old) == count, "FAIL %s count=%d" % (tag, s.count(old))
    s = s.replace(old, new)
    print("ok", tag)

# 1) 工具管理栏导入
rep('import { AppsPage } from "@/components/AppsPage";',
'import { AppsPage } from "@/components/AppsPage";\nimport { ToolManagementBar } from "@/components/providers/ToolManagementBar";',
"import-bar")

# 2) 返回按钮 + AI CLI 按钮（替换现有 AppSwitcher 调用块）
rep('''                  <span className="w-2 shrink-0" aria-hidden="true" />
                  <AppSwitcher
                    activeApp={activeApp}
                    active={appsViewOpen}
                    onToggle={() => {
                      const next = !appsViewOpen;
                      if (next) {
                        setGitViewOpen(false);
                        setNodeViewOpen(false);
                      }
                      setAppsViewOpen(next);
                    }}
                  />''',
'''                  <span className="w-2 shrink-0" aria-hidden="true" />
                  {!appsViewOpen && (
                    <button
                      type="button"
                      onClick={() => {
                        setAppsViewOpen(true);
                        setGitViewOpen(false);
                        setNodeViewOpen(false);
                      }}
                      title={t("appsPage.backToApps", {
                        defaultValue: "返回应用列表",
                      })}
                      aria-label={t("appsPage.backToApps", {
                        defaultValue: "返回应用列表",
                      })}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                  )}
                  <AppSwitcher
                    active={appsViewOpen}
                    onToggle={() => {
                      const next = !appsViewOpen;
                      if (next) {
                        setGitViewOpen(false);
                        setNodeViewOpen(false);
                      }
                      setAppsViewOpen(next);
                    }}
                  />''',
"header-buttons")

# 3) ArrowLeft 图标导入
if 'ArrowLeft,' not in s:
    rep('} from "lucide-react";',
        '  ArrowLeft,\n} from "lucide-react";', "icon-import")

# 4) providers 默认分支：AnimatePresence 之前插入工具管理栏
rep('''        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
                <AnimatePresence mode="wait">''',
'''        default:
          return (
            <div className="px-6 flex flex-col flex-1 min-h-0 overflow-hidden">
              <ToolManagementBar appId={activeApp} />
              <div className="flex-1 overflow-y-auto overflow-x-hidden pb-12 px-1">
                <AnimatePresence mode="wait">''',
"toolbar-inject")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print("ALL OK")
