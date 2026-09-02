import io

p = 'src/App.tsx'
s = io.open(p, encoding='utf-8', newline='').read()

def rep(old, new, tag, count=1):
    global s
    assert s.count(old) == count, "FAIL %s count=%d" % (tag, s.count(old))
    s = s.replace(old, new)
    print("ok", tag)

rep('import { AppSwitcher } from "@/components/AppSwitcher";',
'import { AppSwitcher } from "@/components/AppSwitcher";\nimport { AppsPage } from "@/components/AppsPage";',
"import-page")

rep('''  // Node.js 版本管理页（与 Git 页互斥）
  const [nodeViewOpen, setNodeViewOpen] = useState(false);''',
'''  // Node.js 版本管理页（与 Git 页互斥）
  const [nodeViewOpen, setNodeViewOpen] = useState(false);
  // 应用列表页（三个入口页互斥）
  const [appsViewOpen, setAppsViewOpen] = useState(false);

  const closeAllFeaturePages = useCallback(() => {
    setGitViewOpen(false);
    setNodeViewOpen(false);
    setAppsViewOpen(false);
  }, []);''', "state")

rep('''  // 从供应商页切到设置/其他页面时收起 Git / Node 管理页，否则会挡住目标页面
  useEffect(() => {
    if (currentView !== "providers" && (gitViewOpen || nodeViewOpen)) {
      setGitViewOpen(false);
      setNodeViewOpen(false);
    }
  }, [currentView, gitViewOpen, nodeViewOpen]);''',
'''  // 从供应商页切到设置/其他页面时收起各管理页，否则会挡住目标页面
  useEffect(() => {
    if (currentView !== "providers" && (gitViewOpen || nodeViewOpen || appsViewOpen)) {
      closeAllFeaturePages();
    }
  }, [currentView, gitViewOpen, nodeViewOpen, appsViewOpen, closeAllFeaturePages]);''',
"reset-effect")

rep('''                  <NodeVersionSwitcher
                    active={nodeViewOpen}
                    onToggle={() => {
                      setNodeViewOpen((open) => {
                        const next = !open;
                        if (next) setGitViewOpen(false);
                        return next;
                      });
                    }}
                  />
                  <GitPlatformSwitcher
                    active={gitViewOpen}
                    onToggle={() => {
                      setGitViewOpen((open) => {
                        const next = !open;
                        if (next) setNodeViewOpen(false);
                        return next;
                      });
                    }}
                  />
                  <span className="w-2 shrink-0" aria-hidden="true" />
                  <AppSwitcher
                    activeApp={activeApp}
                    onSwitch={(app) => {
                      setGitViewOpen(false);
                      setActiveApp(app);
                    }}
                    visibleApps={visibleApps}
                  />''',
'''                  <NodeVersionSwitcher
                    active={nodeViewOpen}
                    onToggle={() => {
                      setNodeViewOpen((open) => {
                        const next = !open;
                        if (next) {
                          setGitViewOpen(false);
                          setAppsViewOpen(false);
                        }
                        return next;
                      });
                    }}
                  />
                  <GitPlatformSwitcher
                    active={gitViewOpen}
                    onToggle={() => {
                      setGitViewOpen((open) => {
                        const next = !open;
                        if (next) {
                          setNodeViewOpen(false);
                          setAppsViewOpen(false);
                        }
                        return next;
                      });
                    }}
                  />
                  <span className="w-2 shrink-0" aria-hidden="true" />
                  <AppSwitcher
                    activeApp={activeApp}
                    active={appsViewOpen}
                    onToggle={() => {
                      setAppsViewOpen((open) => {
                        const next = !open;
                        if (next) {
                          setGitViewOpen(false);
                          setNodeViewOpen(false);
                        }
                        return next;
                      });
                    }}
                  />''',
"header")

rep('''      if (nodeViewOpen && currentView === "providers") {
        return <NodeVersionsPage />;
      }''',
'''      if (appsViewOpen && currentView === "providers") {
        return (
          <AppsPage
            activeApp={activeApp}
            visibleApps={visibleApps}
            onSelect={(app) => {
              localStorage.setItem("cc-switch-last-app", app);
              closeAllFeaturePages();
              setActiveApp(app);
            }}
          />
        );
      }
      if (nodeViewOpen && currentView === "providers") {
        return <NodeVersionsPage />;
      }''',
"render")

rep('''          key={
            nodeViewOpen && currentView === "providers"
              ? "node-versions"
              : gitViewOpen && currentView === "providers"
                ? "git-accounts"
                : currentView
          }''',
'''          key={
            appsViewOpen && currentView === "providers"
              ? "apps-page"
              : nodeViewOpen && currentView === "providers"
                ? "node-versions"
                : gitViewOpen && currentView === "providers"
                  ? "git-accounts"
                  : currentView
          }''',
"motion-key")

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print("ALL OK")
