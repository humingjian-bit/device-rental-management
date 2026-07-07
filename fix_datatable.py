content = open("/opt/app-test/src/components/DataTable/index.tsx", "r", encoding="utf-8").read()
old = "  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());"
new = "  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());"
if old in content:
    content = content.replace(old, new)
    open("/opt/app-test/src/components/DataTable/index.tsx", "w", encoding="utf-8").write(content)
    print("Fixed!")
else:
    print("Pattern not found, searching...")
    import re
    m = re.search(r"const \[selectedIds.*?useState<Set<string>>\([^)]+\)", content)
    if m:
        print("Found:", m.group())
    else:
        print("Not found")
