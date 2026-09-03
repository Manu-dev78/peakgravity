Add-Type -AssemblyName System.Drawing

function New-IcoFromPngs {
  param([string[]]$Pngs, [string]$Out)

  $images = @()
  foreach ($p in $Pngs) {
    $bytes = [System.IO.File]::ReadAllBytes($p)
    $img = New-Object System.Drawing.Bitmap $p
    $images += [pscustomobject]@{ Bytes = $bytes; Img = $img; Size = $img.Width }
  }

  # ICONDIR: 6 bytes
  # ICONDIRENTRY: 16 bytes per image
  # Each PNG stored as-is (Vista+ supports embedded PNG in ICO)
  $headerSize = 6 + (16 * $images.Count)
  $offset = $headerSize
  $entries = New-Object System.Collections.Generic.List[byte]
  $dir = New-Object System.Collections.Generic.List[byte]
  $dir.Add(0)              # reserved
  $dir.Add(1)              # type 1 = icon
  $dir.Add([byte]($images.Count -band 0xFF))
  $dir.Add([byte]($images.Count -shr 8 -band 0xFF))

  foreach ($i in $images) {
    $w = if ($i.Size -ge 256) { 0 } else { $i.Size }
    $h = $w
    $dir.Add([byte]$w)
    $dir.Add([byte]$h)
    $dir.Add(0)            # palette
    $dir.Add(0)            # reserved
    $dir.Add([byte]1)      # planes low
    $dir.Add(0)            # planes high
    $dir.Add([byte]32)     # bit depth low
    $dir.Add(0)            # bit depth high
    $sz = $i.Bytes.Length
    $dir.Add([byte]($sz -band 0xFF))
    $dir.Add([byte](($sz -shr 8) -band 0xFF))
    $dir.Add([byte](($sz -shr 16) -band 0xFF))
    $dir.Add([byte](($sz -shr 24) -band 0xFF))
    $dir.Add([byte]($offset -band 0xFF))
    $dir.Add([byte](($offset -shr 8) -band 0xFF))
    $dir.Add([byte](($offset -shr 16) -band 0xFF))
    $dir.Add([byte](($offset -shr 24) -band 0xFF))
    $offset += $sz
  }

  $all = New-Object System.Collections.Generic.List[byte]
  $all.AddRange($dir)
  foreach ($i in $images) { $all.AddRange($i.Bytes) }
  [System.IO.File]::WriteAllBytes($Out, $all.ToArray())
  foreach ($i in $images) { $i.Img.Dispose() }
  Write-Host "wrote $Out"
}

New-IcoFromPngs -Pngs @(
  "build/icon-16.png",
  "build/icon-32.png",
  "build/icon-48.png",
  "build/icon-64.png",
  "build/icon-128.png",
  "build/icon-256.png"
) -Out "build/icon.ico"
