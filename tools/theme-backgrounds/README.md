# 外觀風格背景圖產生器

App 10 套外觀風格的背景圖（`apps/windows_app/assets/themes/*.jpg`）是這裡的程式「畫」出來的：
程序化雜訊做山稜、霧、光暈、顆粒，最後往底色淡化（使用者要求：寫實但不要照片、全部淡化）。

重新產生（Windows PowerShell，不用裝任何東西）：

```powershell
$d = "tools\theme-backgrounds"
$src = (Get-Content -Raw -Encoding utf8 "$d\Painter.cs") + "`n" + ((Get-Content -Raw -Encoding utf8 "$d\Scenes.cs") -replace 'using System;','')
Add-Type -TypeDefinition $src -ReferencedAssemblies System.Drawing -Language CSharp
[Scenes]::All("$env:TEMP\bg")   # 產生 01-dawn.jpg … 10-candy.jpg
```

再把產出的檔案改名成 App 的風格 id（dawn、ink-gold、paper、forest、ocean、sakura、night、nordic、retro、candy）
複製到 `apps/windows_app/assets/themes/`。改了任何一張都要先給使用者確認。
