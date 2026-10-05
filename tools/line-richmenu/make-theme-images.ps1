# 產生 10 套外觀風格的 LINE 圖文選單圖片 → themes/{id}.jpg（再用 upload-themes.js 上傳）
# 用法：powershell -ExecutionPolicy Bypass -File make-theme-images.ps1
$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$fontDir = Join-Path $here 'fonts'
New-Item -ItemType Directory -Force $fontDir | Out-Null

# 跟 App 同一組 Google Fonts（只下載一次，不進 git）
$fonts = @{
  'serif' = 'Noto+Serif+TC:wght@700'
  'sans'  = 'Noto+Sans+TC:wght@500'
  'kai'   = 'LXGW+WenKai+TC:wght@700'
  'round' = 'Huninn'
  'geo'   = 'Chocolate+Classical+Sans'
}
foreach ($name in $fonts.Keys) {
  $file = Join-Path $fontDir "$name.ttf"
  if (Test-Path $file) { continue }
  $css = (Invoke-WebRequest -UseBasicParsing "https://fonts.googleapis.com/css2?family=$($fonts[$name])").Content
  $url = [regex]::Match($css, 'url\((https://[^)]+\.ttf)\)').Groups[1].Value
  Invoke-WebRequest -UseBasicParsing $url -OutFile $file
}
$icons = Join-Path $fontDir 'icons.ttf'
if (-not (Test-Path $icons)) {
  $css = (Invoke-WebRequest -UseBasicParsing 'https://fonts.googleapis.com/icon?family=Material+Icons+Round').Content
  $url = [regex]::Match($css, 'url\((https://[^)]+)\)').Groups[1].Value
  Invoke-WebRequest -UseBasicParsing $url -OutFile $icons
}

Add-Type -ReferencedAssemblies System.Drawing -Path (Join-Path $here 'ThemeMenus.cs')
$bgDir = Join-Path $here '..\..\apps\windows_app\assets\themes'
[ThemeMenus]::Run((Resolve-Path $bgDir).Path, $fontDir, (Join-Path $here 'themes'))
Write-Output "已產生 $(Join-Path $here 'themes')"
