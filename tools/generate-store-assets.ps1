Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$storeDir = Join-Path $root "public\store"
New-Item -ItemType Directory -Force -Path $storeDir | Out-Null

function New-Font($size, $style = [System.Drawing.FontStyle]::Regular) {
  return New-Object System.Drawing.Font -ArgumentList @("Malgun Gothic", [single]$size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

function New-RoundRect($x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-Text($g, $text, $font, $brush, $x, $y, $w, $h, $align = "Near") {
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::$align
  $format.LineAlignment = [System.Drawing.StringAlignment]::Near
  $format.Trimming = [System.Drawing.StringTrimming]::EllipsisWord
  $rect = New-Object System.Drawing.RectangleF -ArgumentList @([single]$x, [single]$y, [single]$w, [single]$h)
  $g.DrawString($text, $font, $brush, $rect, $format)
  $format.Dispose()
}

function Draw-BrandMark($g, $x, $y, $size) {
  $blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 90, 188))
  $path = New-RoundRect $x $y $size $size ([int]($size * 0.2))
  $g.FillPath($blue, $path)
  $font = New-Font ([int]($size * 0.55)) ([System.Drawing.FontStyle]::Bold)
  Draw-Text $g "ㄱ" $font ([System.Drawing.Brushes]::White) ($x + [int]($size * 0.26)) ($y + [int]($size * 0.1)) ([int]($size * 0.5)) ([int]($size * 0.7))
  $font.Dispose()
  $path.Dispose()
  $blue.Dispose()
}

function Draw-PhonePreview($g, $x, $y, $w, $h) {
  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 16, 24, 40))
  $line = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(213, 224, 234)), 2
  $blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 90, 188))
  $soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(242, 247, 255))
  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 24, 40))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(71, 84, 103))

  $shadowPath = New-RoundRect ($x + 10) ($y + 16) $w $h 34
  $phonePath = New-RoundRect $x $y $w $h 34
  $g.FillPath($shadow, $shadowPath)
  $g.FillPath(([System.Drawing.Brushes]::White), $phonePath)
  $g.DrawPath($line, $phonePath)

  $small = New-Font 17 ([System.Drawing.FontStyle]::Bold)
  $title = New-Font 22 ([System.Drawing.FontStyle]::Bold)
  $body = New-Font 15 ([System.Drawing.FontStyle]::Bold)

  Draw-BrandMark $g ($x + 24) ($y + 26) 42
  Draw-Text $g "고소장 도우미" $title $ink ($x + 78) ($y + 34) ($w - 110) 36
  $bar = New-RoundRect ($x + 24) ($y + 92) ($w - 48) 52 10
  $g.FillPath($soft, $bar)
  Draw-Text $g "1 / 8 단계 작성 중" $small $ink ($x + 42) ($y + 105) ($w - 84) 30

  $card1 = New-RoundRect ($x + 24) ($y + 164) ($w - 48) 104 12
  $card2 = New-RoundRect ($x + 24) ($y + 284) ($w - 48) 70 12
  $g.FillPath(([System.Drawing.Brushes]::White), $card1)
  $g.FillPath(([System.Drawing.Brushes]::White), $card2)
  $g.DrawPath($line, $card1)
  $g.DrawPath($line, $card2)
  Draw-Text $g "피해사실 입력" $small $blue ($x + 44) ($y + 184) ($w - 88) 32
  Draw-Text $g "사건 흐름과 증거 정리" $body $muted ($x + 44) ($y + 224) ($w - 88) 28
  Draw-Text $g "PDF 저장" $small $blue ($x + 44) ($y + 304) ($w - 88) 32

  $button = New-RoundRect ($x + 24) ($y + $h - 76) ($w - 48) 48 10
  $g.FillPath($blue, $button)
  Draw-Text $g "고소장 만들기" $small ([System.Drawing.Brushes]::White) ($x + 24) ($y + $h - 65) ($w - 48) 30 "Center"

  foreach ($obj in @($shadow,$line,$blue,$soft,$ink,$muted,$small,$title,$body,$shadowPath,$phonePath,$bar,$card1,$card2,$button)) {
    if ($null -ne $obj) { $obj.Dispose() }
  }
}

function New-Thumbnail($path, $width, $height, $playGraphic) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  $bgRect = New-Object System.Drawing.Rectangle -ArgumentList @(0, 0, $width, $height)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush -ArgumentList @(
    $bgRect,
    [System.Drawing.Color]::FromArgb(245, 248, 255),
    [System.Drawing.Color]::FromArgb(222, 238, 255),
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
  )
  $g.FillRectangle($bg, 0, 0, $width, $height)

  $ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 24, 40))
  $muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(71, 84, 103))
  $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(31, 122, 85))
  $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(190, 215, 255)), 3

  $brandFont = New-Font ([int]($height * 0.055)) ([System.Drawing.FontStyle]::Bold)
  $headlineSize = if ($playGraphic) { [int]($height * 0.092) } else { [int]($height * 0.105) }
  $headlineFont = New-Font $headlineSize ([System.Drawing.FontStyle]::Bold)
  $bodyFont = New-Font ([int]($height * 0.042)) ([System.Drawing.FontStyle]::Bold)
  $badgeFont = New-Font ([int]($height * 0.03)) ([System.Drawing.FontStyle]::Bold)

  Draw-BrandMark $g 72 68 ([int]($height * 0.115))
  Draw-Text $g "고소장 도우미" $brandFont $ink 160 78 420 52

  $headline = if ($playGraphic) { "질문에 답하면`n고소장 초안 정리" } else { "질문에 답하면`n고소장 초안 완성" }
  Draw-Text $g $headline $headlineFont $ink 72 165 ([int]($width * 0.55)) ([int]($height * 0.34))
  Draw-Text $g "범죄유형별 작성 · 증거정리 · PDF 저장" $bodyFont $muted 76 ([int]($height * 0.62)) ([int]($width * 0.58)) 44

  $badges = @("주민번호 미입력", "브라우저 임시저장", "제출 전 확인")
  $badgeX = 76
  foreach ($badge in $badges) {
    $badgeWidth = if ($playGraphic) { 182 } else { 210 }
    $badgeGap = if ($playGraphic) { 12 } else { 18 }
    $badgePath = New-RoundRect $badgeX ([int]($height * 0.76)) $badgeWidth 44 22
    $g.FillPath(([System.Drawing.Brushes]::White), $badgePath)
    $g.DrawPath($linePen, $badgePath)
    Draw-Text $g $badge $badgeFont $green ($badgeX + 10) ([int]($height * 0.775)) ($badgeWidth - 20) 26 "Center"
    $badgeX += $badgeWidth + $badgeGap
    $badgePath.Dispose()
  }

  if ($playGraphic) {
    Draw-PhonePreview $g 660 50 286 400
  } else {
    Draw-PhonePreview $g 790 82 318 458
  }

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  foreach ($obj in @($g,$bmp,$bg,$ink,$muted,$green,$linePen,$brandFont,$headlineFont,$bodyFont,$badgeFont)) {
    if ($null -ne $obj) { $obj.Dispose() }
  }
}

New-Thumbnail (Join-Path $root "public\og.png") 1200 630 $false
New-Thumbnail (Join-Path $storeDir "thumbnail-1200x630.png") 1200 630 $false
New-Thumbnail (Join-Path $storeDir "google-play-feature-1024x500.png") 1024 500 $true

Get-ChildItem $storeDir, (Join-Path $root "public\og.png") | Select-Object FullName, Length



