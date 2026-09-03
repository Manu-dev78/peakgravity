Add-Type -AssemblyName System.Drawing

function New-Icon {
  param([int]$Size, [string]$Out)

  $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded square background — matches app primary blue
  $bg = [System.Drawing.Color]::FromArgb(255, 0, 120, 212)
  $brush = New-Object System.Drawing.SolidBrush $bg
  $radius = [int]($Size * 0.22)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $path.AddArc(($rect.Right - $d), $rect.Y, $d, $d, 270, 90)
  $path.AddArc(($rect.Right - $d), ($rect.Bottom - $d), $d, $d, 0, 90)
  $path.AddArc($rect.X, ($rect.Bottom - $d), $d, $d, 90, 90)
  $path.CloseFigure()
  $g.FillPath($brush, $path)
  $brush.Dispose()
  $path.Dispose()

  # Peak
  $white = [System.Drawing.Color]::White
  $peakBrush = New-Object System.Drawing.SolidBrush $white
  $peakPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $marginF = [single]($Size * 0.18)
  $baseY = [single]($Size - $marginF)
  $peakTop = [single]($Size * 0.14)
  $midX = [single]$Size / 2.0
  $leftX = $marginF
  $rightX = [single]$Size - $marginF
  $notchX = [single]($Size * 0.18)
  $peakPath.AddPolygon(@(
    (New-Object System.Drawing.PointF $midX, $peakTop),
    (New-Object System.Drawing.PointF $rightX, $baseY),
    (New-Object System.Drawing.PointF ($rightX - $notchX), $baseY),
    (New-Object System.Drawing.PointF $midX, ([single]($Size * 0.42))),
    (New-Object System.Drawing.PointF ($leftX + $notchX), $baseY),
    (New-Object System.Drawing.PointF $leftX, $baseY)
  ))
  $g.FillPath($peakBrush, $peakPath)
  $peakPath.Dispose()
  $peakBrush.Dispose()

  # Floating base line
  $linePen = New-Object System.Drawing.Pen $white, ([single]([Math]::Max(1, $Size * 0.08)))
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $lineY = [int]($Size * 0.86)
  $lineMargin = [int]($Size * 0.30)
  $g.DrawLine($linePen, $lineMargin, $lineY, ($Size - $lineMargin), $lineY)
  $linePen.Dispose()

  $dir = Split-Path -Parent $Out
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Host "wrote $Out"
}

$sizes = @(512, 256, 128, 64, 48, 32, 16)
foreach ($s in $sizes) {
  New-Icon -Size $s -Out "build/icon-$s.png"
}

# The 512 is the canonical "icon.png" electron-builder picks up.
Copy-Item -LiteralPath "build/icon-512.png" -Destination "build/icon.png" -Force
Write-Host "wrote build/icon.png"
