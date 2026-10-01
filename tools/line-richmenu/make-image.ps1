# 產生 LINE 圖文選單圖片（2500x1686，2 排 x 4 格）。要在 Windows 跑——要有「微軟正黑體」。
# 用法：powershell -ExecutionPolicy Bypass -File make-image.ps1
Add-Type -AssemblyName System.Drawing

$W = 2500; $H = 1686; $cols = 4; $rows = 2
$cellW = $W / $cols; $cellH = $H / $rows

# 標題、說明、底色（跟 App 的色系一致）
$cells = @(
  @('財務', '收支・預算・資產', '#E8DCEA'),
  @('行事曆', '今天的行程', '#D6E8DE'),
  @('代辦', '還沒做的事', '#D9E4F2'),
  @('人生目標', '進度・打卡', '#F2DDD5'),
  @('知識庫', '收藏・展覽', '#EADCC8'),
  @('健康', '睡眠・運動・體重', '#D5ECE8'),
  @('算命', '梅花易數', '#F0E6CC'),
  @('功能說明', '也可以直接打字問 AI', '#DDE3D4')
)

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::White)

$titleFont = New-Object System.Drawing.Font('Microsoft JhengHei', 120, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$subFont = New-Object System.Drawing.Font('Microsoft JhengHei', 58, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$dark = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#2B2B2B'))
$grey = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml('#5F5F5F'))
$center = New-Object System.Drawing.StringFormat
$center.Alignment = 'Center'; $center.LineAlignment = 'Center'

$gap = 14
for ($i = 0; $i -lt $cells.Count; $i++) {
  $c = $i % $cols; $r = [math]::Floor($i / $cols)
  $x = $c * $cellW + $gap; $y = $r * $cellH + $gap
  $w = $cellW - 2 * $gap; $h = $cellH - 2 * $gap
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($cells[$i][2]))
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $rad = 48
  $path.AddArc($x, $y, $rad, $rad, 180, 90); $path.AddArc($x + $w - $rad, $y, $rad, $rad, 270, 90)
  $path.AddArc($x + $w - $rad, $y + $h - $rad, $rad, $rad, 0, 90); $path.AddArc($x, $y + $h - $rad, $rad, $rad, 90, 90)
  $path.CloseFigure()
  $g.FillPath($bg, $path)
  $g.DrawString($cells[$i][0], $titleFont, $dark, (New-Object System.Drawing.RectangleF($x, ($y + $h * 0.30), $w, ($h * 0.30))), $center)
  $g.DrawString($cells[$i][1], $subFont, $grey, (New-Object System.Drawing.RectangleF($x, ($y + $h * 0.58), $w, ($h * 0.18))), $center)
}

$out = Join-Path $PSScriptRoot 'richmenu.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "已產生 $out"
